import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.security import InvalidTokenError, TokenClaims, verify_token
from app.db.session import get_db
from app.models import User

logger = logging.getLogger(__name__)

DbSession = Annotated[AsyncSession, Depends(get_db)]

# How long a resolved user may be reused without asking the database again.
#
# This is the single largest lever on how fast the app feels. Every
# authenticated request resolves the caller, and that resolution is a SELECT
# against a hosted Postgres in another region — measured at ~480ms, which is
# the floor for `GET /me`, an endpoint that does nothing else. A document page
# makes six or seven authenticated calls, so the app was paying three seconds
# of pure "who are you" before any of them did their own work.
#
# Sixty seconds is chosen against what goes stale. The only mutable fields are
# email, display name and avatar, all of which arrive in the token itself — so
# a cache hit still compares them and falls through to the database the moment
# they differ. What the window really bounds is a user row deleted out from
# under a live session, which self-heals within a minute and is not something
# the app does.
_USER_TTL_SECONDS = 60.0

# Bounded so a long-running process cannot accumulate an entry per user seen.
_USER_CACHE_MAX = 10_000


@dataclass(frozen=True)
class _CachedUser:
    """What the database would have told us, and when it told us.

    A snapshot rather than the ORM instance: a session-bound object outlives
    its session badly, and `User` has no relationships, so the columns are the
    whole of it.
    """

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    created_at: datetime
    fetched_at: float

    def matches(self, claims: TokenClaims) -> bool:
        """Whether this snapshot still agrees with the token.

        A mismatch means Supabase has newer details than the row, which is
        exactly the case `_provision_user` exists to write — so it must not be
        served from cache.
        """
        return (
            self.email == claims.email
            and self.display_name == claims.display_name
            and self.avatar_url == claims.avatar_url
        )


_user_cache: dict[UUID, _CachedUser] = {}


def _cached_user(claims: TokenClaims) -> User | None:
    entry = _user_cache.get(claims.sub)

    if entry is None or not entry.matches(claims):
        return None
    if time.monotonic() - entry.fetched_at > _USER_TTL_SECONDS:
        del _user_cache[claims.sub]
        return None

    # Transient, never added to a session. Endpoints read id, email and
    # display_name from it and nothing writes to it — the only writer is
    # `_provision_user`, and reaching it means this returned None.
    return User(
        id=entry.id,
        email=entry.email,
        display_name=entry.display_name,
        avatar_url=entry.avatar_url,
        created_at=entry.created_at,
    )


def _remember(user: User) -> User:
    if len(_user_cache) >= _USER_CACHE_MAX:
        # Cheap and rare. An LRU would be tidier and this is not a hot enough
        # path to justify one.
        _user_cache.clear()

    _user_cache[user.id] = _CachedUser(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        fetched_at=time.monotonic(),
    )
    return user


def forget_cached_users() -> None:
    """Empty the cache. For tests, which must not leak a user between cases."""
    _user_cache.clear()


# One body for every authentication failure. Varying it would tell a caller
# which part of a forged token to fix next.
_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _UNAUTHENTICATED
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _UNAUTHENTICATED
    return token.strip()


async def _provision_user(db: AsyncSession, claims: TokenClaims) -> User:
    """Return the User for these claims, creating it on first sight.

    Reads before it writes, and that ordering is the difference between a fast
    app and a slow one. This runs on EVERY authenticated request, and it used to
    issue an upsert, a commit and a select unconditionally — three network round
    trips against a hosted database before any endpoint did its own work. At the
    ~0.5s round trip a hosted Postgres in another region actually costs, that
    was around a second and a half of overhead per API call, and pages that make
    two calls paid it twice.

    The overwhelmingly common case is an existing user whose details have not
    changed. That case is a single SELECT and no transaction — and, since the
    cache above, usually no database access at all.
    """
    cached = _cached_user(claims)
    if cached is not None:
        return cached

    result = await db.execute(select(User).where(User.id == claims.sub))
    user = result.scalar_one_or_none()

    if user is not None and (
        user.email == claims.email
        and user.display_name == claims.display_name
        and user.avatar_url == claims.avatar_url
    ):
        return _remember(user)

    if user is None:
        # First sight. An insert that tolerates conflict rather than
        # check-then-insert, so two concurrent first requests from the same new
        # user cannot race into a duplicate-key error.
        stmt = (
            pg_insert(User)
            .values(
                id=claims.sub,
                email=claims.email,
                display_name=claims.display_name,
                avatar_url=claims.avatar_url,
            )
            .on_conflict_do_nothing(index_elements=[User.id])
        )

        try:
            await db.execute(stmt)
            await db.commit()
        except IntegrityError as exc:
            # The id conflict is absorbed above, so reaching here means the
            # email is already held by a DIFFERENT user id. Supabase enforces
            # unique emails, so this indicates stale rows or real corruption.
            # Fail loudly rather than reassigning someone else's documents to
            # this caller.
            await db.rollback()
            logger.error("Email %s is already bound to a different user id", claims.email)
            raise ConflictError("Could not provision user") from exc

        result = await db.execute(select(User).where(User.id == claims.sub))
        return _remember(result.scalar_one())

    # Known user, stale details. Keep the row in step with Supabase without a
    # separate sync job.
    user.email = claims.email
    user.display_name = claims.display_name
    user.avatar_url = claims.avatar_url

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        logger.error("Cannot update user %s to email %s: already taken", user.id, claims.email)
        raise ConflictError("Could not update user") from exc

    # No refresh(): the assignments above are the values, and re-reading them
    # would be another round trip to learn what we just wrote.
    return _remember(user)


async def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the calling user from a Supabase-issued JWT.

    Raises 401 for any authentication failure. A JwksUnavailableError from the
    key cache is deliberately NOT caught here: it propagates to a 503 handler,
    because an unreachable key endpoint is an infrastructure fault and must
    never be downgraded into allowing the request.
    """
    token = _bearer_token(authorization)

    try:
        claims = await verify_token(token)
    except InvalidTokenError:
        raise _UNAUTHENTICATED from None

    return await _provision_user(db, claims)


CurrentUser = Annotated[User, Depends(get_current_user)]

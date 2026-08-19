import logging
from typing import Annotated

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
    changed. That case is now a single SELECT and no transaction at all.
    """
    result = await db.execute(select(User).where(User.id == claims.sub))
    user = result.scalar_one_or_none()

    if user is not None and (
        user.email == claims.email
        and user.display_name == claims.display_name
        and user.avatar_url == claims.avatar_url
    ):
        return user

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
        return result.scalar_one()

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
    return user


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

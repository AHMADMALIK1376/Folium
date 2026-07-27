import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.security import TokenClaims, InvalidTokenError, verify_token
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

    Uses an insert that tolerates conflict rather than check-then-insert, so
    two concurrent first requests from the same new user cannot race into a
    duplicate-key error.
    """
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
        # The id conflict is absorbed above, so reaching here means the email
        # is already held by a DIFFERENT user id. Supabase enforces unique
        # emails, so this indicates stale rows or real corruption. Fail loudly
        # rather than reassigning someone else's documents to this caller.
        await db.rollback()
        logger.error("Email %s is already bound to a different user id", claims.email)
        raise ConflictError("Could not provision user") from exc

    result = await db.execute(select(User).where(User.id == claims.sub))
    user = result.scalar_one()

    # Keep the row in step with Supabase without a separate sync job.
    if user.email != claims.email or user.display_name != claims.display_name:
        user.email = claims.email
        user.display_name = claims.display_name
        user.avatar_url = claims.avatar_url
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            logger.error("Cannot update user %s to email %s: already taken", user.id, claims.email)
            raise ConflictError("Could not update user") from exc
        await db.refresh(user)

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

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.models import User

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    x_dev_user_email: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the calling user.

    PHASE 1 IMPLEMENTATION ONLY. This trusts an unauthenticated header and is
    therefore hard-gated to development. Phase 2 replaces this body with
    Supabase JWT verification; every route depending on it stays unchanged.
    """
    if not settings.is_development:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is not configured",
        )

    if not x_dev_user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    email = x_dev_user_email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email, display_name=email.split("@")[0])
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

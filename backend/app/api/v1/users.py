from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.user import UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
async def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)

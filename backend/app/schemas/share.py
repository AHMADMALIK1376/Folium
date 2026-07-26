import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

PermissionLevel = Literal["view", "comment", "edit"]


class ShareCreate(BaseModel):
    email: EmailStr
    permission: PermissionLevel = "edit"


class ShareUpdate(BaseModel):
    permission: PermissionLevel


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: EmailStr
    display_name: str
    permission: str
    created_at: datetime

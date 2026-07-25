import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.user import UserOut


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    content: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("title must not be blank")
        return cleaned


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("title must not be blank")
        return cleaned


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class DocumentOut(DocumentSummary):
    content: dict[str, Any]
    permission: str
    owner: UserOut


class DocumentListOut(BaseModel):
    owned: list[DocumentSummary]
    shared: list[DocumentSummary]

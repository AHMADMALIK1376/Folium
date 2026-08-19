import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FolderOut(BaseModel):
    """A folder, and how much is in it.

    The count comes from the same query that lists the folders — one per folder
    would be the difference between a sidebar and a sidebar that makes ten round
    trips. It excludes the trash: a deleted document is not in the folder as far
    as anyone reading the number is concerned.
    """

    id: uuid.UUID
    name: str
    created_at: datetime
    document_count: int

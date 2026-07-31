import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class VersionSummary(BaseModel):
    """One entry in a document's history.

    Deliberately without content: a document may hold fifty versions, and
    returning the body of each would make listing the history heavier than
    loading the document itself. `GET .../versions/{id}` fetches one.
    """

    id: uuid.UUID
    created_at: datetime
    created_by: uuid.UUID | None
    # Null when the author's account was deleted. created_by is ON DELETE SET
    # NULL, so history outlives the account that wrote it rather than vanishing
    # with it.
    author_name: str | None


class VersionDetail(VersionSummary):
    content: dict[str, Any]

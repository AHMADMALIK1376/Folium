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


class DiffSegment(BaseModel):
    """One run of text, and what happened to it.

    Runs of the same kind are merged by the service, so a client renders one
    span per change rather than one per word.
    """

    op: str  # "equal" | "added" | "removed"
    text: str


class VersionDiff(BaseModel):
    """What changed between a version and the document as it stands.

    The counts come first because they answer the question most of the time —
    "12 words added, 4 removed" is usually the whole answer, and the segments
    are for when it is not.
    """

    added: int
    removed: int
    segments: list[DiffSegment]

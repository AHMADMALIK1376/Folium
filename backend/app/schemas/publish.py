import uuid
from datetime import datetime

from pydantic import BaseModel


class PublishRequest(BaseModel):
    # Validated in the service, not here: a model validator's failure arrives as
    # a list of objects, and the dialog needs one sentence it can show.
    path: str
    # Only ever true after the person has seen the "changed in GitHub" warning.
    overwrite: bool = False


class Publisher(BaseModel):
    id: uuid.UUID
    display_name: str


class PublishStatus(BaseModel):
    """What the document's publish dialog needs. Carries no secrets."""

    configured: bool
    can_publish: bool
    repo: str | None = None
    branch: str | None = None
    # The path to offer: the saved one, else a suggestion from the title.
    path: str
    is_published: bool
    last_published_at: datetime | None = None
    last_published_by: Publisher | None = None
    file_url: str | None = None


class PublishOut(BaseModel):
    path: str
    commit_sha: str
    commit_url: str
    file_url: str
    blob_sha: str
    published_at: datetime
    published_by: Publisher


class PublicationOut(BaseModel):
    id: uuid.UUID
    path: str
    commit_sha: str
    commit_url: str
    published_at: datetime
    published_by: Publisher | None = None


class Features(BaseModel):
    collaboration: bool
    attachments: bool
    github_publish: bool

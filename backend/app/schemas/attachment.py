import uuid
from datetime import datetime

from pydantic import BaseModel


class AttachmentOut(BaseModel):
    """One file attached to a document.

    Deliberately without `storage_path`: it is an internal address in a private
    bucket, and a caller who cannot reach Storage has no use for it. Downloads
    go through `GET .../attachments/{id}/url`, which checks permission and mints
    a short-lived signed URL.
    """

    id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AttachmentUrlOut(BaseModel):
    """A signed URL, and how long it is good for.

    The lifetime is returned rather than assumed so the browser can decide
    whether a held URL is still worth using instead of discovering it expired.
    """

    url: str
    expires_in: int

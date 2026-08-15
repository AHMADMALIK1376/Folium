import uuid

from pydantic import BaseModel


class CollabUser(BaseModel):
    """Who is joining, so the editor can label their cursor.

    The caller's own profile, not the document owner's. Phase 4-i had only the
    owner to hand and labelled every caret with it, so everyone in a shared
    document appeared under the owner's name.
    """

    id: uuid.UUID
    email: str
    display_name: str


class CollabSession(BaseModel):
    """What a client needs to join a document's collaboration room.

    `enabled` is false when the deployment has no y-sweet configured. That is a
    supported state, not an error: the editor falls back to the single-user
    autosave it has had since Phase 2C-ii, and the rest of the fields are null.
    """

    enabled: bool
    url: str | None = None
    # The client needs both: `url` is the WebSocket endpoint, `base_url` the
    # document-level HTTP one. y-sweet's client token carries both, so passing
    # only one leaves the provider unable to connect.
    base_url: str | None = None
    doc_id: str | None = None
    token: str | None = None
    # What the caller may do, so a viewer's client knows to stay out of the
    # shared document. Advisory only — content reaches the database through
    # PATCH, which enforces this properly.
    permission: str
    # Present whether or not collaboration is enabled: a constant shape means a
    # client never has to branch to find out who it is.
    user: CollabUser

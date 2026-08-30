import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.config import settings
from app.schemas.page_setup import PageSetup
from app.schemas.user import UserOut


def _validate_tiptap_doc(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Reject content that is not a TipTap document.

    Content is stored as jsonb and consumed by the editor and, later, the
    collaboration service. Accepting arbitrary JSON here would let malformed
    documents reach both.
    """
    if value is None:
        return None

    def _check_node(node: Any) -> None:
        if not isinstance(node, dict) or not isinstance(node.get("type"), str):
            # ValueError (not TypeError) is required here: pydantic's field_validator
            # only converts ValueError/AssertionError into a ValidationError.
            raise ValueError(  # noqa: TRY004
                "each TipTap node must be an object with a string 'type'"
            )
        content = node.get("content")
        if content is not None:
            if not isinstance(content, list):
                raise ValueError("TipTap node 'content' must be a list")
            for child in content:
                _check_node(child)

    if not isinstance(value, dict) or value.get("type") != "doc":
        raise ValueError("content must be a TipTap document with type 'doc'")

    content = value.get("content")
    if content is not None:
        if not isinstance(content, list):
            raise ValueError("content must be a list of TipTap nodes")
        for node in content:
            _check_node(node)

    return value


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

    @field_validator("content")
    @classmethod
    def content_is_tiptap_doc(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _validate_tiptap_doc(v)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: dict[str, Any] | None = None
    # Filing is a property of the document, so it rides the document PATCH
    # rather than earning a route.
    #
    # None here is MEANINGFUL — it means "take this out of its folder" — so the
    # caller must distinguish it from the field being omitted, which means
    # "leave the folder alone". `model_fields_set` is how: without that check
    # every title-only autosave would silently unfile the document.
    folder_id: uuid.UUID | None = None
    # Owner only, and `model_fields_set` again: False is meaningful — it stops
    # something being a template — so its absence has to be distinguishable
    # from it, exactly as for folder_id above.
    is_template: bool | None = None
    # How the document sits on paper. Validated rather than accepted as loose
    # JSON — see app/schemas/page_setup.py for why a jsonb column needs that.
    #
    # None is meaningful here too, and the fourth field to need `model_fields_set`:
    # it means "back to the application's defaults", which is not the same as
    # leaving the setting alone during a content autosave.
    page_setup: PageSetup | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("title must not be blank")
        return cleaned

    @field_validator("content")
    @classmethod
    def content_is_tiptap_doc(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _validate_tiptap_doc(v)


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
    is_template: bool = False
    # None means "never set up": the editor applies its own defaults rather
    # than the row asserting a page size nobody chose.
    page_setup: PageSetup | None = None

    @computed_field
    @property
    def attachments_enabled(self) -> bool:
        """Whether this deployment can store attachments at all.

        Carried on the document rather than fetched separately, for the same
        reason CollabSession carries `enabled`: the editor is already loading
        this payload, and what it may do with a document is part of what the
        document is. Computed rather than assigned so that every place building
        a DocumentOut — five of them — cannot forget it.
        """
        return settings.attachments_enabled


class DocumentListItem(DocumentSummary):
    """A document in a list, and whether this person starred it.

    Carried here rather than fetched separately, and that is a performance
    decision with a measurable cost behind it. The dashboard used to call
    /documents and /documents/starred, and each authenticated call pays a
    database round trip of roughly half a second against a hosted Postgres in
    another region. Folding the flag into the list it belongs to removes an
    entire request from the page.
    """

    starred: bool = False
    folder_id: uuid.UUID | None = None
    is_template: bool = False


class DocumentListOut(BaseModel):
    owned: list[DocumentListItem]
    shared: list[DocumentListItem]

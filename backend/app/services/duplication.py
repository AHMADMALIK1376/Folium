"""Making a copy of a document.

Anyone who can *see* a document can duplicate it, and that is not a loosening
of anything: they can already export it as Markdown and import the file back,
which produces a worse copy through more steps. Refusing the button would
protect nothing and cost the honest case.

What the copy carries and what it leaves behind is the whole design, and it is
written down in the docstring of `duplicate` rather than inferred from the code.
"""

import json
import logging
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attachment, Document
from app.services import storage
from app.services.attachments import storage_path
from app.services.documents import get_document
from app.services.storage import StorageUnavailableError
from app.utils.import_file import doc_to_plain_text

logger = logging.getLogger(__name__)

COPY_PREFIX = "Copy of "
MAX_TITLE = 500


def copied_title(title: str) -> str:
    """"Copy of X", kept inside the column's limit.

    A long title truncates rather than failing the whole duplication: losing
    the tail of a name is a smaller loss than losing the copy.
    """
    prefixed = f"{COPY_PREFIX}{title}"

    return prefixed if len(prefixed) <= MAX_TITLE else prefixed[:MAX_TITLE]


def rewrite_attachment_references(
    content: dict[str, Any], replacements: dict[UUID, UUID]
) -> dict[str, Any]:
    """Point the copy's images at the copy's own attachments.

    This is the part it would be tempting to skip. Skipping it produces a
    document whose images work today and break the moment the original is
    deleted or unshared — a duplicate that quietly rots, which is worse than no
    duplicate at all.

    Done on the serialised JSON rather than by walking the node tree, because an
    attachment id can appear in any node type that carries a URL, and a walker
    would have to know them all. The ids are UUIDs inside a fixed URL shape, so
    there is nothing else in a document they could collide with.
    """
    if not replacements:
        return content

    serialised = json.dumps(content)
    for old, new in replacements.items():
        serialised = serialised.replace(f"/attachments/{old}/", f"/attachments/{new}/")

    return json.loads(serialised)


async def duplicate(
    db: AsyncSession, document_id: UUID, user_id: UUID, *, as_copy: bool = True
) -> Document:
    """Copy a document into the caller's account.

    Carried over: the title (prefixed "Copy of" unless `as_copy` is False, which
    is how a template becomes a document under its own name), the content, the
    attachments, and the page setup.

    Page setup travels because it is formatting, not organisation: a template
    whose margins do not survive being used is a template that does not work.
    It is the same reason the content comes along and the folder does not.

    Left behind, each for its own reason:

    - **Shares.** A copy is not a re-share; who sees it is the copier's decision
      to make, and inheriting it would hand a document to people the copier
      never chose.
    - **Comments.** A discussion is about the document it happened on.
    - **Version history.** The copy has no past.
    - **Stars.** A private bookmark, not a property of the document.
    - **The template flag.** A copy of a template is a document, which is the
      entire point of using one.
    """
    original, _ = await get_document(db, document_id, user_id)

    copy = Document(
        owner_id=user_id,
        title=copied_title(original.title) if as_copy else original.title[:MAX_TITLE],
        # Placeholder: the real content is written below, once the attachments
        # exist and their new ids are known.
        content=original.content,
        content_text=original.content_text,
        page_setup=original.page_setup,
    )
    db.add(copy)
    # The copy needs an id before an attachment can point at it.
    await db.flush()

    replacements = await _copy_attachments(db, original.id, copy.id)

    if replacements:
        copy.content = rewrite_attachment_references(original.content, replacements)
        copy.content_text = doc_to_plain_text(copy.content)

    await db.commit()
    await db.refresh(copy)

    return copy


async def _copy_attachments(
    db: AsyncSession, source_id: UUID, target_id: UUID
) -> dict[UUID, UUID]:
    """Copy every attachment, returning old id → new id.

    A file that cannot be copied is skipped rather than failing the duplication.
    The alternative is losing an entire document because one image is missing
    from storage, and the content rewrite below only redirects the ones that
    actually made it — so a skipped file leaves its reference pointing at the
    original, which still works while the original exists.
    """
    originals = (
        (await db.execute(select(Attachment).where(Attachment.document_id == source_id)))
        .scalars()
        .all()
    )

    replacements: dict[UUID, UUID] = {}

    for attachment in originals:
        new_id = uuid.uuid4()
        destination = storage_path(target_id, new_id, attachment.filename)

        try:
            await storage.copy(attachment.storage_path, destination)
        except StorageUnavailableError:
            logger.warning(
                "Skipped attachment %s while duplicating %s: storage refused the copy",
                attachment.id,
                source_id,
            )
            continue

        db.add(
            Attachment(
                id=new_id,
                document_id=target_id,
                filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size_bytes,
                storage_path=destination,
            )
        )
        replacements[attachment.id] = new_id

    return replacements

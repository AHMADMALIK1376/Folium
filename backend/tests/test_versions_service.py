"""Snapshot policy: when a version is written, and how many are kept.

These test the service directly rather than through HTTP, because the rules are
about time and row counts, not about status codes.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models import Document, DocumentVersion, User
from app.services import versions as service


@pytest.fixture
async def db():
    async with AsyncSessionLocal() as session:
        yield session


def doc_content(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


async def make_user(db) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"versions-{uuid.uuid4()}@example.com",
        display_name="Version Tester",
    )
    db.add(user)
    await db.commit()
    return user


async def make_document(db, owner: User, text: str = "original") -> Document:
    document = Document(
        owner_id=owner.id,
        title="Versioned",
        content=doc_content(text),
        content_text=text,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def count_versions(db, document_id) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
    )
    return result.scalar_one()


async def newest_version(db, document_id) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def test_first_update_snapshots_the_content_being_replaced(db):
    user = await make_user(db)
    document = await make_document(db, user, "before")

    await service.maybe_snapshot(db, document, user.id)
    await db.commit()

    assert await count_versions(db, document.id) == 1
    version = await newest_version(db, document.id)
    # The old content, not the new: that is what makes restore mean "go back"
    # rather than "duplicate what is already on screen".
    assert version.content == doc_content("before")
    assert version.created_by == user.id


async def test_a_second_update_moments_later_snapshots_nothing(db):
    user = await make_user(db)
    document = await make_document(db, user)

    await service.maybe_snapshot(db, document, user.id)
    await db.commit()
    await service.maybe_snapshot(db, document, user.id)
    await db.commit()

    # Autosave fires roughly every 800ms. Without this rule an afternoon of
    # typing would be hundreds of full-document copies.
    assert await count_versions(db, document.id) == 1


async def test_a_snapshot_older_than_the_interval_allows_another(db):
    user = await make_user(db)
    document = await make_document(db, user)

    await service.maybe_snapshot(db, document, user.id)
    await db.commit()

    stale = await newest_version(db, document.id)
    stale.created_at = datetime.now(UTC) - service.SNAPSHOT_INTERVAL - timedelta(seconds=1)
    await db.commit()

    await service.maybe_snapshot(db, document, user.id)
    await db.commit()

    assert await count_versions(db, document.id) == 2


async def test_a_different_author_snapshots_even_inside_the_interval(db):
    """The case version history exists for.

    Two collaborators overwriting each other is precisely what needs rescuing,
    and time-bucketing alone would let one replace the other silently inside the
    same five minutes.
    """
    owner = await make_user(db)
    collaborator = await make_user(db)
    document = await make_document(db, owner)

    await service.maybe_snapshot(db, document, owner.id)
    await db.commit()
    await service.maybe_snapshot(db, document, collaborator.id)
    await db.commit()

    assert await count_versions(db, document.id) == 2


async def test_pruning_keeps_only_the_newest_allowed_versions(db):
    user = await make_user(db)
    document = await make_document(db, user)

    base = datetime.now(UTC) - timedelta(days=1)
    for index in range(service.MAX_VERSIONS_PER_DOCUMENT + 10):
        db.add(
            DocumentVersion(
                document_id=document.id,
                content=doc_content(f"v{index}"),
                created_by=user.id,
                created_at=base + timedelta(minutes=index),
            )
        )
    await db.commit()

    await service.prune(db, document.id)
    await db.commit()

    assert await count_versions(db, document.id) == service.MAX_VERSIONS_PER_DOCUMENT
    newest = await newest_version(db, document.id)
    assert newest.content == doc_content(
        f"v{service.MAX_VERSIONS_PER_DOCUMENT + 10 - 1}"
    )


async def test_pruning_leaves_other_documents_alone(db):
    user = await make_user(db)
    document = await make_document(db, user)
    other = await make_document(db, user)

    base = datetime.now(UTC) - timedelta(days=1)
    for index in range(service.MAX_VERSIONS_PER_DOCUMENT + 5):
        db.add(
            DocumentVersion(
                document_id=document.id,
                content=doc_content(f"v{index}"),
                created_by=user.id,
                created_at=base + timedelta(minutes=index),
            )
        )
    db.add(
        DocumentVersion(
            document_id=other.id,
            content=doc_content("other"),
            created_by=user.id,
            created_at=base,
        )
    )
    await db.commit()

    await service.prune(db, document.id)
    await db.commit()

    # Pruning is scoped to the document being written, so cost stays
    # proportional to that document rather than to the whole table.
    assert await count_versions(db, other.id) == 1


async def test_snapshot_writes_unconditionally(db):
    """restore_version uses this: a restore is always worth a row, so the person
    who restored the wrong draft can get back."""
    user = await make_user(db)
    document = await make_document(db, user)

    await service.snapshot(db, document, user.id)
    await service.snapshot(db, document, user.id)
    await db.commit()

    assert await count_versions(db, document.id) == 2

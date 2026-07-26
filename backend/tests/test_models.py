import uuid

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models import Document, User


async def test_can_create_user_and_document():
    async with AsyncSessionLocal() as session:
        user = User(email=f"{uuid.uuid4()}@example.com", display_name="Test User")
        session.add(user)
        await session.flush()

        doc = Document(owner_id=user.id, title="First doc")
        session.add(doc)
        await session.commit()

        found = await session.execute(select(Document).where(Document.id == doc.id))
        stored = found.scalar_one()
        assert stored.title == "First doc"
        assert stored.is_deleted is False
        assert stored.content == {"type": "doc", "content": [{"type": "paragraph"}]}

# Folium Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Folium into a separated `frontend/` + `backend/` repository, and build a working FastAPI backend on PostgreSQL with the full production schema, document and sharing APIs, and CI.

**Architecture:** One repository, two independently deployable applications. The existing Next.js app moves into `frontend/` unchanged. A new FastAPI application in `backend/` owns all business logic, layered as `api/` (HTTP only) → `services/` (business logic, no HTTP) → `models/` (database). Authentication is deliberately a **seam** in this phase: `get_current_user` has a development-only implementation that Phase 2 replaces with Supabase JWT verification. Nothing else in the codebase changes when that swap happens.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async) + asyncpg, Alembic, Pydantic v2, pytest + pytest-asyncio + httpx, PostgreSQL 16 (Docker locally, GitHub Actions service in CI, Supabase in production).

## Global Constraints

- Python **3.12+**. Node **22.5+** for the existing frontend.
- Backend source lives under `backend/app/`; tests under `backend/tests/`.
- **`services/` must never import from `fastapi`.** Business logic raises domain exceptions from `app/core/exceptions.py`; only `api/` translates those to HTTP.
- **Unauthorized access returns 404, never 403.** A 403 confirms a document exists, leaking its existence to users who should not know.
- All document content is **TipTap JSON** stored in a `jsonb` column — never HTML.
- Emails are stored **lowercased**, normalised at the application layer.
- Every model uses `uuid` primary keys and `timestamptz` timestamps.
- Do not implement authentication, real-time collaboration, or billing in this phase.

**Deliberately deferred to Phase 2:** the frontend restructure described in spec §3 — route groups
`(marketing)`/`(auth)`/`(app)`, Tailwind and shadcn/ui setup, the brand palette, and the typed API
client. Those depend on auth existing: building an `(auth)` route group and login screens before
Supabase Auth is wired would mean writing pages that cannot work. Phase 1 moves the frontend
unchanged and leaves it functional; Phase 2 restructures and restyles it alongside real auth.

---

### Task 1: Move the frontend into `frontend/`

**Files:**
- Move: `src/`, `public/`, `test/`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `.npmrc` → `frontend/`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a `frontend/` directory containing the working v1 Next.js app. All later frontend paths are relative to `frontend/`.

- [ ] **Step 1: Verify the frontend builds before moving anything**

```bash
cd D:/AJAIA/Folium && npm run build
```

Expected: build completes, "Compiled successfully". If this fails now, fix it before moving files — otherwise you cannot tell whether the move broke it.

- [ ] **Step 2: Move the frontend files with git**

```bash
cd D:/AJAIA/Folium
mkdir -p frontend
git mv src public test package.json package-lock.json tsconfig.json next.config.mjs next-env.d.ts .npmrc frontend/
```

- [ ] **Step 3: Move the untracked build and dependency directories**

```bash
cd D:/AJAIA/Folium
rm -rf .next node_modules data
```

These are all gitignored and regenerate. Removing them avoids a stale `node_modules` at the repository root shadowing the new location.

- [ ] **Step 4: Update `.gitignore` for the new layout**

Replace the entire contents of `.gitignore` with:

```gitignore
node_modules/
.next/
out/
build/
data/
*.sqlite
*.sqlite-wal
*.sqlite-shm
.env
.env.local
.env*.local
.DS_Store
*.pem
npm-debug.log*
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/
*.egg-info/
.coverage
htmlcov/
```

- [ ] **Step 5: Reinstall and verify the frontend still builds from its new home**

```bash
cd D:/AJAIA/Folium/frontend && npm install && npm run build
```

Expected: "Compiled successfully". Same result as Step 1.

- [ ] **Step 6: Verify the frontend tests still pass**

```bash
cd D:/AJAIA/Folium/frontend && npm test
```

Expected: 14 tests pass.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add -A
git commit -m "refactor: move Next.js app into frontend/ for separated architecture"
```

---

### Task 2: Scaffold the FastAPI backend

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`, `backend/.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: `app.config.Settings` with fields `database_url: str`, `environment: str`, `frontend_origin: str`; module-level `settings` instance. `app.main.app` — the FastAPI application. Test fixture `client` yielding an `httpx.AsyncClient`.

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "folium-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "python-multipart>=0.0.12",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "ruff>=0.7",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.setuptools.packages.find]
include = ["app*"]
```

- [ ] **Step 2: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://folium:folium@localhost:5433/folium"
    environment: str = "development"
    frontend_origin: str = "http://localhost:3000"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


settings = Settings()
```

- [ ] **Step 3: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="Folium API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Create `backend/app/__init__.py` and `backend/tests/__init__.py`**

Both files are empty.

- [ ] **Step 5: Create `backend/.env.example`**

```bash
DATABASE_URL=postgresql+asyncpg://folium:folium@localhost:5433/folium
ENVIRONMENT=development
FRONTEND_ORIGIN=http://localhost:3000
```

- [ ] **Step 6: Create `backend/tests/conftest.py`**

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

- [ ] **Step 7: Write the failing test in `backend/tests/test_health.py`**

```python
from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 8: Create the virtual environment and install**

```bash
cd D:/AJAIA/Folium/backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"
```

Expected: installs without error. On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

- [ ] **Step 9: Run the test**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_health.py -v
```

Expected: PASS. This confirms FastAPI, pytest-asyncio, and httpx are wired correctly.

- [ ] **Step 10: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with config and health endpoint"
```

---

### Task 3: Local PostgreSQL and the async database session

**Files:**
- Create: `docker-compose.yml`, `backend/app/db/__init__.py`, `backend/app/db/base.py`, `backend/app/db/session.py`
- Test: `backend/tests/test_db_connection.py`

**Interfaces:**
- Consumes: `app.config.settings.database_url`
- Produces: `app.db.base.Base` — the SQLAlchemy `DeclarativeBase` all models inherit. `app.db.session.engine`, `app.db.session.AsyncSessionLocal`, and async generator `app.db.session.get_db() -> AsyncSession`.

- [ ] **Step 1: Create `docker-compose.yml` at the repository root**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: folium
      POSTGRES_PASSWORD: folium
      POSTGRES_DB: folium
    ports:
      - "5433:5432"
    volumes:
      - folium_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U folium"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  folium_pgdata:
```

Port 5433 is deliberate — it avoids colliding with any PostgreSQL already installed locally on 5432.

- [ ] **Step 2: Start the database**

```bash
cd D:/AJAIA/Folium && docker compose up -d
```

Expected: `Container folium-db-1 Started`. Verify with `docker compose ps` — status should be `healthy`.

- [ ] **Step 3: Create `backend/app/db/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 4: Create `backend/app/db/session.py`**

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 5: Create empty `backend/app/db/__init__.py`**

- [ ] **Step 6: Write the failing test in `backend/tests/test_db_connection.py`**

```python
from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def test_database_is_reachable():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1
```

- [ ] **Step 7: Run the test**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_db_connection.py -v
```

Expected: PASS. If it fails with a connection error, the Docker container is not running or not yet healthy — recheck Step 2.

- [ ] **Step 8: Commit**

```bash
cd D:/AJAIA/Folium
git add docker-compose.yml backend/
git commit -m "feat(backend): add local Postgres and async SQLAlchemy session"
```

---

### Task 4: SQLAlchemy models and the initial Alembic migration

**Files:**
- Create: `backend/app/core/__init__.py`, `backend/app/core/constants.py`, `backend/app/models/__init__.py`, `backend/app/models/user.py`, `backend/app/models/document.py`, `backend/app/models/share.py`, `backend/app/models/version.py`, `backend/app/models/attachment.py`, `backend/alembic.ini`, `backend/alembic/env.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.db.base.Base`
- Produces (also): `app.core.constants.empty_doc() -> dict` — the canonical empty TipTap document, imported by both the model layer and the file importer so the shape is defined exactly once.
- Produces: ORM classes `User`, `Document`, `DocumentShare`, `DocumentVersion`, `Attachment`. `User` has `id, email, display_name, avatar_url, created_at`. `Document` has `id, owner_id, title, content, content_text, is_deleted, deleted_at, created_at, updated_at`. `DocumentShare` has `id, document_id, user_id, permission, granted_by, created_at`.

- [ ] **Step 0: Create `backend/app/core/__init__.py` (empty) and `backend/app/core/constants.py`**

```python
from typing import Any


def empty_doc() -> dict[str, Any]:
    """Return a fresh empty TipTap document.

    A factory rather than a module-level constant: JSONB values are mutable, and
    a shared dict would let one document's edits leak into another's default.
    """
    return {"type": "doc", "content": [{"type": "paragraph"}]}
```

`core/` holds things with no dependencies on anything else in the app, so both `models/` and
`utils/` can import from it without creating a cycle.

- [ ] **Step 1: Create `backend/app/models/user.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

Emails are stored lowercased by the service layer, so a plain unique index is sufficient and avoids depending on the `citext` extension.

- [ ] **Step 2: Create `backend/app/models/document.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import empty_doc
from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=empty_doc)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_documents_owner", "owner_id"),)
```

- [ ] **Step 3: Create `backend/app/models/share.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission: Mapped[str] = mapped_column(String(20), nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_share_document_user"),
        CheckConstraint(
            "permission IN ('view', 'comment', 'edit')", name="ck_share_permission"
        ),
        Index("idx_shares_document", "document_id"),
        Index("idx_shares_user", "user_id"),
    )
```

- [ ] **Step 4: Create `backend/app/models/version.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_versions_document_created", "document_id", "created_at"),)
```

- [ ] **Step 5: Create `backend/app/models/attachment.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 6: Create `backend/app/models/__init__.py`**

```python
from app.models.attachment import Attachment
from app.models.document import Document
from app.models.share import DocumentShare
from app.models.user import User
from app.models.version import DocumentVersion

__all__ = ["Attachment", "Document", "DocumentShare", "DocumentVersion", "User"]
```

Importing every model here is what makes Alembic's autogenerate see them all.

- [ ] **Step 7: Initialise Alembic**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m alembic init alembic
```

Expected: creates `alembic.ini`, `alembic/env.py`, `alembic/versions/`.

- [ ] **Step 8: Replace the generated `backend/alembic/env.py` entirely**

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from app.config import settings
from app.db.base import Base
from app import models  # noqa: F401  imports every model so autogenerate sees them

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 9: Generate the initial migration**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m alembic revision --autogenerate -m "initial schema"
```

Expected: creates a file under `alembic/versions/`. Open it and confirm it contains `create_table` calls for all five tables. If it is empty, `app/models/__init__.py` is not importing every model.

- [ ] **Step 10: Apply the migration**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m alembic upgrade head
```

Expected: `Running upgrade -> <revision>, initial schema`.

- [ ] **Step 11: Write the failing test in `backend/tests/test_models.py`**

```python
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
```

- [ ] **Step 12: Run the test**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_models.py -v
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add SQLAlchemy models and initial Alembic migration"
```

---

### Task 5: Permission resolution logic

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/permissions.py`
- Test: `backend/tests/test_permissions.py`

**Interfaces:**
- Consumes: nothing (this module is deliberately pure — no database, no HTTP)
- Produces: `Permission` (str Enum with `VIEW`, `COMMENT`, `EDIT`, `OWNER`), `resolve_permission(owner_id: UUID, user_id: UUID, shares: dict[UUID, str]) -> Permission | None`, `can_edit(permission: Permission | None) -> bool`, `can_view(permission: Permission | None) -> bool`.

This is the direct successor to v1's `canAccessDocument`. It stays pure so it can be tested without a database or web server — the single most important test in the codebase, since it is what prevents one user reading another's private documents.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_permissions.py`**

```python
import uuid

import pytest

from app.services.permissions import Permission, can_edit, can_view, resolve_permission

OWNER = uuid.uuid4()
SHARED = uuid.uuid4()
STRANGER = uuid.uuid4()


def test_owner_gets_owner_permission():
    assert resolve_permission(OWNER, OWNER, {}) is Permission.OWNER


def test_stranger_gets_none():
    assert resolve_permission(OWNER, STRANGER, {}) is None


def test_stranger_with_other_shares_still_gets_none():
    assert resolve_permission(OWNER, STRANGER, {SHARED: "edit"}) is None


@pytest.mark.parametrize("level", ["view", "comment", "edit"])
def test_shared_user_gets_their_level(level):
    assert resolve_permission(OWNER, SHARED, {SHARED: level}) is Permission(level)


def test_owner_wins_even_if_also_in_share_list():
    assert resolve_permission(OWNER, OWNER, {OWNER: "view"}) is Permission.OWNER


def test_unknown_permission_string_is_denied():
    assert resolve_permission(OWNER, SHARED, {SHARED: "superuser"}) is None


def test_can_edit_only_for_owner_and_edit():
    assert can_edit(Permission.OWNER) is True
    assert can_edit(Permission.EDIT) is True
    assert can_edit(Permission.COMMENT) is False
    assert can_edit(Permission.VIEW) is False
    assert can_edit(None) is False


def test_can_view_for_every_granted_level():
    assert can_view(Permission.OWNER) is True
    assert can_view(Permission.EDIT) is True
    assert can_view(Permission.COMMENT) is True
    assert can_view(Permission.VIEW) is True
    assert can_view(None) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_permissions.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.permissions'`.

- [ ] **Step 3: Create empty `backend/app/services/__init__.py`**

- [ ] **Step 4: Create `backend/app/services/permissions.py`**

```python
from enum import Enum
from uuid import UUID


class Permission(str, Enum):
    VIEW = "view"
    COMMENT = "comment"
    EDIT = "edit"
    OWNER = "owner"


def resolve_permission(
    owner_id: UUID, user_id: UUID, shares: dict[UUID, str]
) -> Permission | None:
    """Return the permission `user_id` holds on a document, or None if no access.

    Pure by design: no database access, no HTTP. `shares` maps user id to the
    stored permission string. Unrecognised permission strings are denied rather
    than trusted, so bad data fails closed.
    """
    if owner_id == user_id:
        return Permission.OWNER

    granted = shares.get(user_id)
    if granted is None:
        return None

    try:
        permission = Permission(granted)
    except ValueError:
        return None

    return None if permission is Permission.OWNER else permission


def can_edit(permission: Permission | None) -> bool:
    return permission in (Permission.OWNER, Permission.EDIT)


def can_view(permission: Permission | None) -> bool:
    return permission is not None
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_permissions.py -v
```

Expected: 10 tests PASS (8 functions, one of which is parametrized three times).

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add pure permission resolution with view/comment/edit levels"
```

---

### Task 6: Port the file importer to produce TipTap JSON

**Files:**
- Create: `backend/app/utils/__init__.py`, `backend/app/utils/import_file.py`
- Test: `backend/tests/test_import_file.py`

**Interfaces:**
- Consumes: nothing
- Produces: `markdown_to_doc(md: str) -> dict`, `plain_text_to_doc(text: str) -> dict`, `title_from_filename(filename: str) -> str`, `doc_to_plain_text(doc: dict) -> str`.

This ports `frontend/src/lib/importFile.ts`, with one significant change: it emits **TipTap JSON**, not HTML. TipTap JSON nodes look like `{"type": "paragraph", "content": [{"type": "text", "text": "hi"}]}`, with bold and italic expressed as `marks`. Because the output is structured data rather than a string, HTML escaping is no longer needed — a `<script>` in the source becomes literal text in a text node.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_import_file.py`**

```python
from app.utils.import_file import (
    doc_to_plain_text,
    markdown_to_doc,
    plain_text_to_doc,
    title_from_filename,
)


def test_paragraph():
    assert markdown_to_doc("hello world") == {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "hello world"}]}
        ],
    }


def test_headings_levels_one_to_three():
    doc = markdown_to_doc("# One\n## Two\n### Three")
    assert [n["attrs"]["level"] for n in doc["content"]] == [1, 2, 3]
    assert all(n["type"] == "heading" for n in doc["content"])


def test_bold_becomes_a_mark():
    doc = markdown_to_doc("a **b** c")
    assert doc["content"][0]["content"] == [
        {"type": "text", "text": "a "},
        {"type": "text", "text": "b", "marks": [{"type": "bold"}]},
        {"type": "text", "text": " c"},
    ]


def test_italic_becomes_a_mark():
    doc = markdown_to_doc("*emphasis*")
    assert doc["content"][0]["content"] == [
        {"type": "text", "text": "emphasis", "marks": [{"type": "italic"}]}
    ]


def test_bullet_list_groups_consecutive_items():
    doc = markdown_to_doc("- one\n- two")
    node = doc["content"][0]
    assert node["type"] == "bulletList"
    assert len(node["content"]) == 2
    assert node["content"][0] == {
        "type": "listItem",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "one"}]}],
    }


def test_ordered_list():
    doc = markdown_to_doc("1. first\n2. second")
    assert doc["content"][0]["type"] == "orderedList"
    assert len(doc["content"][0]["content"]) == 2


def test_switching_list_type_starts_a_new_list():
    doc = markdown_to_doc("- bullet\n1. numbered")
    assert [n["type"] for n in doc["content"]] == ["bulletList", "orderedList"]


def test_html_in_source_is_literal_text_not_markup():
    doc = markdown_to_doc("<script>alert(1)</script>")
    assert doc["content"][0]["content"][0]["text"] == "<script>alert(1)</script>"


def test_empty_markdown_yields_empty_paragraph():
    assert markdown_to_doc("") == {"type": "doc", "content": [{"type": "paragraph"}]}


def test_plain_text_splits_paragraphs_on_blank_lines():
    doc = plain_text_to_doc("first para\n\nsecond para")
    assert len(doc["content"]) == 2
    assert doc["content"][1]["content"][0]["text"] == "second para"


def test_plain_text_keeps_single_newlines_as_hard_breaks():
    doc = plain_text_to_doc("line one\nline two")
    types = [n["type"] for n in doc["content"][0]["content"]]
    assert types == ["text", "hardBreak", "text"]


def test_plain_text_empty_yields_empty_paragraph():
    assert plain_text_to_doc("   ") == {"type": "doc", "content": [{"type": "paragraph"}]}


def test_title_from_filename_strips_extension_and_separators():
    assert title_from_filename("my-project_notes.md") == "my project notes"


def test_title_from_filename_falls_back_when_empty():
    assert title_from_filename(".md") == "Imported document"


def test_doc_to_plain_text_flattens_all_text():
    doc = markdown_to_doc("# Title\n\nSome **bold** text")
    assert doc_to_plain_text(doc) == "Title\nSome bold text"
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_import_file.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.utils.import_file'`.

- [ ] **Step 3: Create empty `backend/app/utils/__init__.py`**

- [ ] **Step 4: Create `backend/app/utils/import_file.py`**

```python
import re
from typing import Any

from app.core.constants import empty_doc

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
NUMBERED_RE = re.compile(r"^\d+\.\s+(.*)$")
BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)")


def _text_node(text: str, mark: str | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": text}
    if mark:
        node["marks"] = [{"type": mark}]
    return node


def _inline(text: str) -> list[dict[str, Any]]:
    """Split a line into TipTap text nodes, applying bold and italic marks.

    Bold is matched first so that ** is never mistaken for a pair of italics.
    """
    nodes: list[dict[str, Any]] = []
    pos = 0
    pattern = re.compile(f"({BOLD_RE.pattern})|({ITALIC_RE.pattern})")

    for match in pattern.finditer(text):
        if match.start() > pos:
            nodes.append(_text_node(text[pos : match.start()]))
        if match.group(2) is not None:
            nodes.append(_text_node(match.group(2), "bold"))
        else:
            nodes.append(_text_node(match.group(4), "italic"))
        pos = match.end()

    if pos < len(text):
        nodes.append(_text_node(text[pos:]))

    if not nodes and text:
        nodes.append(_text_node(text))

    return nodes


def _paragraph(text: str) -> dict[str, Any]:
    """Build a paragraph node.

    TipTap rejects text nodes with empty strings, so an empty paragraph omits
    `content` entirely rather than carrying a zero-length text node.
    """
    content = _inline(text)
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


def _list_item(text: str) -> dict[str, Any]:
    return {"type": "listItem", "content": [_paragraph(text)]}


def markdown_to_doc(md: str) -> dict[str, Any]:
    """Convert a markdown subset to a TipTap JSON document.

    Handles h1-h3, bold, italic, and bullet/ordered lists — the same formatting
    the editor itself supports. Not a CommonMark implementation.
    """
    lines = md.replace("\r\n", "\n").split("\n")
    content: list[dict[str, Any]] = []
    list_node: dict[str, Any] | None = None

    def close_list() -> None:
        nonlocal list_node
        if list_node is not None:
            content.append(list_node)
            list_node = None

    for raw in lines:
        line = raw.rstrip()

        if heading := HEADING_RE.match(line):
            close_list()
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": len(heading.group(1))},
                    "content": _inline(heading.group(2)),
                }
            )
        elif bullet := BULLET_RE.match(line):
            if list_node is None or list_node["type"] != "bulletList":
                close_list()
                list_node = {"type": "bulletList", "content": []}
            list_node["content"].append(_list_item(bullet.group(1)))
        elif numbered := NUMBERED_RE.match(line):
            if list_node is None or list_node["type"] != "orderedList":
                close_list()
                list_node = {"type": "orderedList", "content": []}
            list_node["content"].append(_list_item(numbered.group(1)))
        elif line.strip() == "":
            close_list()
        else:
            close_list()
            content.append(_paragraph(line))

    close_list()

    if not content:
        return empty_doc()

    return {"type": "doc", "content": content}


def plain_text_to_doc(text: str) -> dict[str, Any]:
    """Convert plain text to TipTap JSON, splitting paragraphs on blank lines."""
    blocks = [b.strip() for b in re.split(r"\n{2,}", text.replace("\r\n", "\n"))]
    blocks = [b for b in blocks if b]

    if not blocks:
        return empty_doc()

    content: list[dict[str, Any]] = []
    for block in blocks:
        nodes: list[dict[str, Any]] = []
        for index, line in enumerate(block.split("\n")):
            if index > 0:
                nodes.append({"type": "hardBreak"})
            nodes.append(_text_node(line))
        content.append({"type": "paragraph", "content": nodes})

    return {"type": "doc", "content": content}


def title_from_filename(filename: str) -> str:
    base = re.sub(r"\.[^/.]+$", "", filename)
    cleaned = re.sub(r"[-_]+", " ", base).strip()
    return cleaned or "Imported document"


def doc_to_plain_text(doc: dict[str, Any]) -> str:
    """Flatten a TipTap document to plain text, one line per block node."""
    lines: list[str] = []

    def walk(node: dict[str, Any]) -> str:
        if node.get("type") == "text":
            return node.get("text", "")
        return "".join(walk(child) for child in node.get("content", []))

    for block in doc.get("content", []):
        if block.get("type") in ("bulletList", "orderedList"):
            for item in block.get("content", []):
                text = walk(item).strip()
                if text:
                    lines.append(text)
        else:
            text = walk(block).strip()
            if text:
                lines.append(text)

    return "\n".join(lines)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_import_file.py -v
```

Expected: 15 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): port file importer to emit TipTap JSON"
```

---

### Task 7: Pydantic schemas and domain exceptions

**Files:**
- Create: `backend/app/core/exceptions.py`, `backend/app/schemas/__init__.py`, `backend/app/schemas/user.py`, `backend/app/schemas/document.py`, `backend/app/schemas/share.py`
- Test: `backend/tests/test_schemas.py`

**Interfaces:**
- Consumes: `app.services.permissions.Permission`
- Produces: exceptions `NotFoundError`, `PermissionDeniedError`, `ValidationError`, `ConflictError` (all subclasses of `FoliumError`). Schemas `UserOut`, `DocumentCreate`, `DocumentUpdate`, `DocumentOut`, `DocumentSummary`, `DocumentListOut`, `ShareCreate`, `ShareUpdate`, `ShareOut`.

- [ ] **Step 1: Create `backend/app/core/exceptions.py`**

```python
class FoliumError(Exception):
    """Base class for domain errors raised by the service layer.

    The service layer must never import fastapi. These exceptions are the
    contract between services and the HTTP layer, which maps them to
    status codes.
    """


class NotFoundError(FoliumError):
    """The resource does not exist, or the caller may not know that it does."""


class PermissionDeniedError(FoliumError):
    """The caller may see the resource but not perform this action."""


class ValidationError(FoliumError):
    """The request was well-formed but semantically invalid."""


class ConflictError(FoliumError):
    """The request conflicts with current state."""
```

- [ ] **Step 2: Create empty `backend/app/schemas/__init__.py`**

`backend/app/core/__init__.py` already exists from Task 4.

- [ ] **Step 3: Create `backend/app/schemas/user.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    avatar_url: str | None = None
    created_at: datetime
```

- [ ] **Step 4: Create `backend/app/schemas/document.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.user import UserOut


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


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("title must not be blank")
        return cleaned


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


class DocumentListOut(BaseModel):
    owned: list[DocumentSummary]
    shared: list[DocumentSummary]
```

- [ ] **Step 5: Create `backend/app/schemas/share.py`**

```python
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

PermissionLevel = Literal["view", "comment", "edit"]


class ShareCreate(BaseModel):
    email: EmailStr
    permission: PermissionLevel = "edit"


class ShareUpdate(BaseModel):
    permission: PermissionLevel


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: EmailStr
    display_name: str
    permission: str
    created_at: datetime
```

- [ ] **Step 6: Write the tests in `backend/tests/test_schemas.py`**

```python
import pytest
from pydantic import ValidationError as PydanticValidationError

from app.schemas.document import DocumentCreate, DocumentUpdate
from app.schemas.share import ShareCreate


def test_document_create_trims_title():
    assert DocumentCreate(title="  Spaced  ").title == "Spaced"


def test_document_create_rejects_blank_title():
    with pytest.raises(PydanticValidationError):
        DocumentCreate(title="   ")


def test_document_create_rejects_empty_title():
    with pytest.raises(PydanticValidationError):
        DocumentCreate(title="")


def test_document_update_allows_all_fields_absent():
    assert DocumentUpdate().title is None


def test_document_update_rejects_blank_title():
    with pytest.raises(PydanticValidationError):
        DocumentUpdate(title="  ")


def test_share_create_defaults_to_edit():
    assert ShareCreate(email="a@example.com").permission == "edit"


def test_share_create_rejects_unknown_permission():
    with pytest.raises(PydanticValidationError):
        ShareCreate(email="a@example.com", permission="admin")


def test_share_create_rejects_malformed_email():
    with pytest.raises(PydanticValidationError):
        ShareCreate(email="not-an-email")
```

- [ ] **Step 7: Install the email validator dependency**

`EmailStr` requires an extra package. Add `"pydantic[email]>=2.9"` to `dependencies` in `backend/pyproject.toml`, replacing the existing `"pydantic>=2.9"` line, then reinstall:

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pip install -e ".[dev]"
```

- [ ] **Step 8: Run the tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_schemas.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 9: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add Pydantic schemas and domain exception types"
```

---

### Task 8: The authentication seam

**Files:**
- Create: `backend/app/api/__init__.py`, `backend/app/api/deps.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth_seam.py`

**Interfaces:**
- Consumes: `app.db.session.get_db`, `app.models.User`, `app.config.settings`
- Produces: `get_current_user(...) -> User` FastAPI dependency, resolving the caller from the `X-Dev-User-Email` header in development only.

**This is the seam Phase 2 replaces.** In this phase it reads a header and looks up (or creates) a user. It **refuses to run outside development**, so a misconfigured production deploy fails closed rather than accepting an unauthenticated header. Phase 2 swaps the body of this function for Supabase JWT verification; no route changes.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_auth_seam.py`**

```python
import pytest
from httpx import AsyncClient

from app.config import settings


async def test_missing_header_is_unauthorized(client: AsyncClient):
    response = await client.get("/api/v1/me")
    assert response.status_code == 401


async def test_dev_header_resolves_a_user(client: AsyncClient):
    response = await client.get("/api/v1/me", headers={"X-Dev-User-Email": "Alice@Example.com"})
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


async def test_same_email_returns_the_same_user(client: AsyncClient):
    headers = {"X-Dev-User-Email": "stable@example.com"}
    first = await client.get("/api/v1/me", headers=headers)
    second = await client.get("/api/v1/me", headers=headers)
    assert first.json()["id"] == second.json()["id"]


async def test_dev_header_is_rejected_outside_development(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    response = await client.get("/api/v1/me", headers={"X-Dev-User-Email": "a@example.com"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_auth_seam.py -v
```

Expected: FAIL with 404 responses — the route does not exist yet.

- [ ] **Step 3: Create `backend/app/api/deps.py`**

```python
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.models import User

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    x_dev_user_email: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the calling user.

    PHASE 1 IMPLEMENTATION ONLY. This trusts an unauthenticated header and is
    therefore hard-gated to development. Phase 2 replaces this body with
    Supabase JWT verification; every route depending on it stays unchanged.
    """
    if not settings.is_development:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is not configured",
        )

    if not x_dev_user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    email = x_dev_user_email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email, display_name=email.split("@")[0])
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
```

- [ ] **Step 4: Create empty `backend/app/api/__init__.py`**

- [ ] **Step 5: Create `backend/app/api/v1/__init__.py` and `backend/app/api/v1/users.py`**

`backend/app/api/v1/__init__.py` is empty. `backend/app/api/v1/users.py`:

```python
from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.user import UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
async def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
```

- [ ] **Step 6: Create `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
```

- [ ] **Step 7: Register the router and exception handlers in `backend/app/main.py`**

Replace the entire file:

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

app = FastAPI(title="Folium API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotFoundError)
async def handle_not_found(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc) or "Not found"})


@app.exception_handler(PermissionDeniedError)
async def handle_permission_denied(
    request: Request, exc: PermissionDeniedError
) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc) or "Forbidden"})


@app.exception_handler(ValidationError)
async def handle_validation(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc) or "Invalid request"})


@app.exception_handler(ConflictError)
async def handle_conflict(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc) or "Conflict"})


app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 8: Run the tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_auth_seam.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add dev-only auth seam and exception handlers"
```

---

### Task 9: Document service and routes

**Files:**
- Create: `backend/app/services/documents.py`, `backend/app/api/v1/documents.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_documents_api.py`

**Interfaces:**
- Consumes: `resolve_permission`, `can_edit`, `can_view`, `NotFoundError`, `PermissionDeniedError`, `CurrentUser`, `DbSession`, `doc_to_plain_text`
- Produces: service functions `list_documents(db, user_id) -> tuple[list[Document], list[Document]]`, `get_document(db, doc_id, user_id) -> tuple[Document, Permission]`, `create_document(db, user_id, data) -> Document`, `update_document(db, doc_id, user_id, data) -> tuple[Document, Permission]`, `soft_delete_document(db, doc_id, user_id) -> None`, `restore_document(db, doc_id, user_id) -> Document`, `load_owner(db, owner_id) -> User`.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_documents_api.py`**

```python
import uuid

import pytest
from httpx import AsyncClient


def headers(email: str) -> dict[str, str]:
    return {"X-Dev-User-Email": email}


@pytest.fixture
def alice() -> dict[str, str]:
    return headers(f"alice-{uuid.uuid4()}@example.com")


@pytest.fixture
def bob() -> dict[str, str]:
    return headers(f"bob-{uuid.uuid4()}@example.com")


async def test_create_document(client: AsyncClient, alice):
    response = await client.post("/api/v1/documents", json={"title": "My doc"}, headers=alice)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "My doc"
    assert body["permission"] == "owner"
    assert body["content"] == {"type": "doc", "content": [{"type": "paragraph"}]}


async def test_create_rejects_blank_title(client: AsyncClient, alice):
    response = await client.post("/api/v1/documents", json={"title": "  "}, headers=alice)
    assert response.status_code == 422


async def test_owner_can_read_own_document(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert response.status_code == 200
    assert response.json()["title"] == "Mine"


async def test_stranger_gets_404_not_403(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Secret"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.get(f"/api/v1/documents/{doc_id}", headers=bob)
    assert response.status_code == 404


async def test_unknown_document_is_404(client: AsyncClient, alice):
    response = await client.get(f"/api/v1/documents/{uuid.uuid4()}", headers=alice)
    assert response.status_code == 404


async def test_update_title_and_content(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Draft"}, headers=alice)
    doc_id = created.json()["id"]
    new_content = {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
    }
    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Final", "content": new_content},
        headers=alice,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Final"
    assert response.json()["content"] == new_content


async def test_stranger_cannot_update(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Hijacked"}, headers=bob
    )
    assert response.status_code == 404


async def test_list_separates_owned_from_shared(client: AsyncClient, alice):
    await client.post("/api/v1/documents", json={"title": "One"}, headers=alice)
    response = await client.get("/api/v1/documents", headers=alice)
    assert response.status_code == 200
    body = response.json()
    assert len(body["owned"]) == 1
    assert body["shared"] == []


async def test_soft_delete_hides_from_list_but_allows_restore(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Temp"}, headers=alice)
    doc_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/documents/{doc_id}", headers=alice)
    assert deleted.status_code == 204

    listing = await client.get("/api/v1/documents", headers=alice)
    assert all(d["id"] != doc_id for d in listing.json()["owned"])

    gone = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert gone.status_code == 404

    restored = await client.post(f"/api/v1/documents/{doc_id}/restore", headers=alice)
    assert restored.status_code == 200

    back = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert back.status_code == 200


async def test_stranger_cannot_delete(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.delete(f"/api/v1/documents/{doc_id}", headers=bob)
    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_documents_api.py -v
```

Expected: FAIL with 404s — the routes do not exist.

- [ ] **Step 3: Create `backend/app/services/documents.py`**

```python
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import empty_doc
from app.core.exceptions import NotFoundError
from app.models import Document, DocumentShare, User
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.services.permissions import Permission, can_edit, resolve_permission
from app.utils.import_file import doc_to_plain_text


async def _shares_for(db: AsyncSession, document_id: UUID) -> dict[UUID, str]:
    result = await db.execute(
        select(DocumentShare.user_id, DocumentShare.permission).where(
            DocumentShare.document_id == document_id
        )
    )
    return {row.user_id: row.permission for row in result}


async def get_document(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> tuple[Document, Permission]:
    """Fetch a document the user may see.

    Raises NotFoundError for both "does not exist" and "not allowed", so the
    API cannot leak the existence of documents the caller may not see.
    """
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or document.is_deleted:
        raise NotFoundError("Document not found")

    shares = await _shares_for(db, document_id)
    permission = resolve_permission(document.owner_id, user_id, shares)

    if permission is None:
        raise NotFoundError("Document not found")

    return document, permission


async def list_documents(
    db: AsyncSession, user_id: UUID
) -> tuple[list[Document], list[Document]]:
    owned_result = await db.execute(
        select(Document)
        .where(Document.owner_id == user_id, Document.is_deleted.is_(False))
        .order_by(Document.updated_at.desc())
    )
    shared_result = await db.execute(
        select(Document)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .where(DocumentShare.user_id == user_id, Document.is_deleted.is_(False))
        .order_by(Document.updated_at.desc())
    )
    return list(owned_result.scalars()), list(shared_result.scalars())


async def create_document(db: AsyncSession, user_id: UUID, data: DocumentCreate) -> Document:
    content = data.content if data.content is not None else empty_doc()
    document = Document(
        owner_id=user_id,
        title=data.title,
        content=content,
        content_text=doc_to_plain_text(content),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def update_document(
    db: AsyncSession, document_id: UUID, user_id: UUID, data: DocumentUpdate
) -> tuple[Document, Permission]:
    document, permission = await get_document(db, document_id, user_id)
    if not can_edit(permission):
        raise NotFoundError("Document not found")

    if data.title is not None:
        document.title = data.title
    if data.content is not None:
        document.content = data.content
        document.content_text = doc_to_plain_text(data.content)

    await db.commit()
    await db.refresh(document)
    return document, permission


async def soft_delete_document(db: AsyncSession, document_id: UUID, user_id: UUID) -> None:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or document.is_deleted or document.owner_id != user_id:
        raise NotFoundError("Document not found")

    document.is_deleted = True
    document.deleted_at = datetime.now(UTC)
    await db.commit()


async def restore_document(db: AsyncSession, document_id: UUID, user_id: UUID) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or not document.is_deleted or document.owner_id != user_id:
        raise NotFoundError("Document not found")

    document.is_deleted = False
    document.deleted_at = None
    await db.commit()
    await db.refresh(document)
    return document


async def load_owner(db: AsyncSession, owner_id: UUID) -> User:
    result = await db.execute(select(User).where(User.id == owner_id))
    return result.scalar_one()
```

Only the **owner** may delete or restore, which is why those two functions check ownership directly rather than going through `get_document`. A user shared in at edit level can change a document's contents but cannot delete it out from under its owner.

- [ ] **Step 4: Create `backend/app/api/v1/documents.py`**

```python
from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.document import (
    DocumentCreate,
    DocumentListOut,
    DocumentOut,
    DocumentSummary,
    DocumentUpdate,
)
from app.schemas.user import UserOut
from app.services import documents as service

router = APIRouter(prefix="/documents", tags=["documents"])


async def _to_out(db: DbSession, document, permission: str) -> DocumentOut:
    owner = await service.load_owner(db, document.owner_id)
    return DocumentOut(
        id=document.id,
        title=document.title,
        owner_id=document.owner_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        content=document.content,
        permission=permission,
        owner=UserOut.model_validate(owner),
    )


@router.get("", response_model=DocumentListOut)
async def list_documents(db: DbSession, user: CurrentUser) -> DocumentListOut:
    owned, shared = await service.list_documents(db, user.id)
    return DocumentListOut(
        owned=[DocumentSummary.model_validate(d) for d in owned],
        shared=[DocumentSummary.model_validate(d) for d in shared],
    )


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document = await service.create_document(db, user.id, data)
    return await _to_out(db, document, "owner")


@router.get("/{document_id}", response_model=DocumentOut)
async def read_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document, permission = await service.get_document(db, document_id, user.id)
    return await _to_out(db, document, permission.value)


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: UUID, data: DocumentUpdate, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document, permission = await service.update_document(db, document_id, user.id, data)
    return await _to_out(db, document, permission.value)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    await service.soft_delete_document(db, document_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/restore", response_model=DocumentOut)
async def restore_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document = await service.restore_document(db, document_id, user.id)
    return await _to_out(db, document, "owner")
```

- [ ] **Step 5: Register the router in `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import documents, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(documents.router)
```

- [ ] **Step 6: Run the tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_documents_api.py -v
```

Expected: 10 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add document CRUD with soft delete and 404-on-denied"
```

---

### Task 10: Sharing service and routes

**Files:**
- Create: `backend/app/services/sharing.py`, `backend/app/api/v1/shares.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_shares_api.py`

**Interfaces:**
- Consumes: `get_document`, `Permission`, `NotFoundError`, `ValidationError`
- Produces: `list_shares(db, doc_id, user_id)` returning `list[tuple[User, str, datetime]]`, `share_document(db, doc_id, owner_id, data)` returning `tuple[User, DocumentShare]`, `update_share(db, doc_id, owner_id, target_user_id, permission)`, `unshare_document(db, doc_id, owner_id, target_user_id)`.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_shares_api.py`**

```python
import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


def headers(email: str) -> dict[str, str]:
    return {"X-Dev-User-Email": email}


async def make_doc(client: AsyncClient, email: str, title: str = "Doc") -> str:
    response = await client.post(
        "/api/v1/documents", json={"title": title}, headers=headers(email)
    )
    return response.json()["id"]


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=headers(email))


async def test_owner_can_share_and_recipient_sees_it(
    client: AsyncClient, alice_email, bob_email
):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 201

    listing = await client.get("/api/v1/documents", headers=headers(bob_email))
    assert [d["id"] for d in listing.json()["shared"]] == [doc_id]


async def test_shared_viewer_can_read_but_not_edit(
    client: AsyncClient, alice_email, bob_email
):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=headers(alice_email),
    )

    read = await client.get(f"/api/v1/documents/{doc_id}", headers=headers(bob_email))
    assert read.status_code == 200
    assert read.json()["permission"] == "view"

    write = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Nope"}, headers=headers(bob_email)
    )
    assert write.status_code == 404


async def test_shared_editor_can_edit(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )

    write = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Edited"}, headers=headers(bob_email)
    )
    assert write.status_code == 200


async def test_sharing_with_unknown_email_is_422(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": "nobody@example.com", "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 422


async def test_cannot_share_with_yourself(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": alice_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 422


async def test_non_owner_cannot_share(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(bob_email),
    )
    assert response.status_code == 404


async def test_resharing_updates_the_permission(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    for level in ("view", "edit"):
        await client.post(
            f"/api/v1/documents/{doc_id}/shares",
            json={"email": bob_email, "permission": level},
            headers=headers(alice_email),
        )

    listing = await client.get(
        f"/api/v1/documents/{doc_id}/shares", headers=headers(alice_email)
    )
    assert len(listing.json()) == 1
    assert listing.json()[0]["permission"] == "edit"


async def test_unshare_revokes_access(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    share = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    bob_id = share.json()["user_id"]

    removed = await client.delete(
        f"/api/v1/documents/{doc_id}/shares/{bob_id}", headers=headers(alice_email)
    )
    assert removed.status_code == 204

    denied = await client.get(f"/api/v1/documents/{doc_id}", headers=headers(bob_email))
    assert denied.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_shares_api.py -v
```

Expected: FAIL — the share routes do not exist.

- [ ] **Step 3: Create `backend/app/services/sharing.py`**

```python
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models import Document, DocumentShare, User
from app.schemas.share import ShareCreate
from app.services.permissions import Permission
from app.services.documents import get_document


async def _require_owner(db: AsyncSession, document_id: UUID, user_id: UUID) -> Document:
    document, permission = await get_document(db, document_id, user_id)
    if permission is not Permission.OWNER:
        raise NotFoundError("Document not found")
    return document


async def list_shares(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> list[tuple[User, str, datetime]]:
    await get_document(db, document_id, user_id)
    result = await db.execute(
        select(User, DocumentShare.permission, DocumentShare.created_at)
        .join(DocumentShare, DocumentShare.user_id == User.id)
        .where(DocumentShare.document_id == document_id)
        .order_by(User.display_name)
    )
    return [(row[0], row[1], row[2]) for row in result]


async def share_document(
    db: AsyncSession, document_id: UUID, owner_id: UUID, data: ShareCreate
) -> tuple[User, DocumentShare]:
    await _require_owner(db, document_id, owner_id)

    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    target = result.scalar_one_or_none()

    if target is None:
        raise ValidationError("No user with that email")
    if target.id == owner_id:
        raise ValidationError("You already own this document")

    existing = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target.id,
        )
    )
    share = existing.scalar_one_or_none()

    if share is None:
        share = DocumentShare(
            document_id=document_id,
            user_id=target.id,
            permission=data.permission,
            granted_by=owner_id,
        )
        db.add(share)
    else:
        share.permission = data.permission

    await db.commit()
    await db.refresh(share)
    return target, share


async def update_share(
    db: AsyncSession, document_id: UUID, owner_id: UUID, target_user_id: UUID, permission: str
) -> None:
    await _require_owner(db, document_id, owner_id)
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target_user_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise NotFoundError("Share not found")

    share.permission = permission
    await db.commit()


async def unshare_document(
    db: AsyncSession, document_id: UUID, owner_id: UUID, target_user_id: UUID
) -> None:
    await _require_owner(db, document_id, owner_id)
    await db.execute(
        delete(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target_user_id,
        )
    )
    await db.commit()
```

- [ ] **Step 4: Create `backend/app/api/v1/shares.py`**

```python
from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.share import ShareCreate, ShareOut, ShareUpdate
from app.services import sharing as service

router = APIRouter(prefix="/documents/{document_id}/shares", tags=["shares"])


@router.get("", response_model=list[ShareOut])
async def list_shares(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> list[ShareOut]:
    rows = await service.list_shares(db, document_id, user.id)
    return [
        ShareOut(
            user_id=target.id,
            email=target.email,
            display_name=target.display_name,
            permission=permission,
            created_at=created_at,
        )
        for target, permission, created_at in rows
    ]


@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
async def create_share(
    document_id: UUID, data: ShareCreate, db: DbSession, user: CurrentUser
) -> ShareOut:
    target, share = await service.share_document(db, document_id, user.id, data)
    return ShareOut(
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.patch("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_share(
    document_id: UUID,
    target_user_id: UUID,
    data: ShareUpdate,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    await service.update_share(db, document_id, user.id, target_user_id, data.permission)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    document_id: UUID, target_user_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    await service.unshare_document(db, document_id, user.id, target_user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 5: Register the router in `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import documents, shares, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(documents.router)
api_router.include_router(shares.router)
```

- [ ] **Step 6: Run the tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_shares_api.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 7: Run the whole suite**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -v
```

Expected: all tests pass (roughly 58).

- [ ] **Step 8: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add document sharing with permission levels"
```

---

### Task 11: File import endpoint

**Files:**
- Create: `backend/app/api/v1/uploads.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_upload_api.py`

**Interfaces:**
- Consumes: `markdown_to_doc`, `plain_text_to_doc`, `title_from_filename`, `create_document`, `DocumentCreate`
- Produces: `POST /api/v1/documents/import` accepting a multipart `file` field.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_upload_api.py`**

```python
import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture
def alice() -> dict[str, str]:
    return {"X-Dev-User-Email": f"alice-{uuid.uuid4()}@example.com"}


async def test_import_markdown_creates_formatted_document(client: AsyncClient, alice):
    files = {"file": ("notes.md", b"# Title\n\nSome **bold** text", "text/markdown")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "notes"
    assert body["content"]["content"][0]["type"] == "heading"


async def test_import_plain_text(client: AsyncClient, alice):
    files = {"file": ("my_notes.txt", b"first para\n\nsecond para", "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 201
    assert response.json()["title"] == "my notes"
    assert len(response.json()["content"]["content"]) == 2


async def test_rejects_unsupported_extension(client: AsyncClient, alice):
    files = {"file": ("photo.png", b"\x89PNG\r\n", "image/png")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422
    assert "supported" in response.json()["detail"].lower()


async def test_rejects_oversized_file(client: AsyncClient, alice):
    files = {"file": ("big.txt", b"x" * (2 * 1024 * 1024 + 1), "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422
    assert "2mb" in response.json()["detail"].lower()


async def test_rejects_non_utf8_content(client: AsyncClient, alice):
    files = {"file": ("bad.txt", b"\xff\xfe\x00binary", "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_upload_api.py -v
```

Expected: FAIL with 404 — the route does not exist.

- [ ] **Step 3: Create `backend/app/api/v1/uploads.py`**

```python
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.schemas.document import DocumentCreate, DocumentOut
from app.schemas.user import UserOut
from app.services import documents as service
from app.utils.import_file import markdown_to_doc, plain_text_to_doc, title_from_filename

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_BYTES = 2 * 1024 * 1024
MARKDOWN_SUFFIXES = {".md", ".markdown"}
ALLOWED_SUFFIXES = MARKDOWN_SUFFIXES | {".txt"}


@router.post("/import", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def import_document(
    db: DbSession, user: CurrentUser, file: UploadFile = File(...)
) -> DocumentOut:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValidationError("Only .txt and .md files are supported")

    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise ValidationError("File is larger than the 2MB limit")

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("File must be UTF-8 encoded text") from exc

    content = markdown_to_doc(text) if suffix in MARKDOWN_SUFFIXES else plain_text_to_doc(text)
    data = DocumentCreate(title=title_from_filename(file.filename or ""), content=content)
    document = await service.create_document(db, user.id, data)
    owner = await service.load_owner(db, document.owner_id)

    return DocumentOut(
        id=document.id,
        title=document.title,
        owner_id=document.owner_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        content=document.content,
        permission="owner",
        owner=UserOut.model_validate(owner),
    )
```

- [ ] **Step 4: Register the router in `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import documents, shares, uploads, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(uploads.router)
api_router.include_router(documents.router)
api_router.include_router(shares.router)
```

`uploads.router` is registered **before** `documents.router` so that `/documents/import` matches the literal route rather than being captured by `/documents/{document_id}`.

- [ ] **Step 5: Run the tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_upload_api.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add .txt/.md import endpoint producing TipTap JSON"
```

---

### Task 12: Continuous integration

**Files:**
- Create: `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `backend/pyproject.toml`, `frontend/package.json`
- Produces: two GitHub Actions workflows gating every push and pull request.

CI matters here specifically because Vercel and Render deploy automatically on push to `main` — without a gate, a broken push reaches production unreviewed.

- [ ] **Step 1: Create `.github/workflows/backend.yml`**

```yaml
name: backend

on:
  push:
    branches: [main]
    paths: ["backend/**", ".github/workflows/backend.yml"]
  pull_request:
    paths: ["backend/**", ".github/workflows/backend.yml"]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: folium
          POSTGRES_PASSWORD: folium
          POSTGRES_DB: folium
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U folium"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql+asyncpg://folium:folium@localhost:5433/folium
      ENVIRONMENT: development

    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Lint
        run: ruff check .

      - name: Run migrations
        run: alembic upgrade head

      - name: Run tests
        run: pytest -v
```

- [ ] **Step 2: Create `.github/workflows/frontend.yml`**

```yaml
name: frontend

on:
  push:
    branches: [main]
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
  pull_request:
    paths: ["frontend/**", ".github/workflows/frontend.yml"]

jobs:
  build:
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

- [ ] **Step 3: Verify the backend lints cleanly before pushing**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m ruff check .
```

Expected: "All checks passed!". Fix any reported issues before continuing.

- [ ] **Step 4: Add a development section to `README.md`**

Insert this section immediately before the "## Documentation" heading:

```markdown
## Development (v2)

Requires Docker, Python 3.12+, and Node 22.5+.

Start the database:

```bash
docker compose up -d
```

Run the backend:

```bash
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m alembic upgrade head && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Interactive API docs are then served at http://localhost:8000/docs.

Run the backend tests:

```bash
cd backend && .venv/Scripts/python -m pytest -v
```

### Branching

`main` is always deployable and deploys automatically. Work on short-lived
branches named `feat/<phase>-<thing>` and merge via pull request — CI gates the
merge, and Vercel builds a preview deployment for every PR.
```

- [ ] **Step 5: Commit**

```bash
cd D:/AJAIA/Folium
git add .github/ README.md
git commit -m "ci: add backend and frontend workflows"
```

- [ ] **Step 6: Push and confirm CI passes**

```bash
cd D:/AJAIA/Folium && git push -u origin HEAD
```

Then open the repository's Actions tab and confirm both workflows are green. **After the first successful run**, enable branch protection on `main` in Settings → Branches, requiring both status checks to pass — without that, CI reports failures after they have already deployed.

---

## Definition of done

- [ ] `frontend/` builds and its 14 tests pass
- [ ] `backend/` test suite passes in full (~63 tests)
- [ ] `alembic upgrade head` creates all five tables on a clean database
- [ ] A user without access receives **404** from every document and share route
- [ ] Both CI workflows are green, and branch protection on `main` requires them
- [ ] No authentication, real-time, or billing code exists — those are later phases

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
MAX_TITLE_LENGTH = 500  # Matches DocumentCreate.title max_length; truncate long filenames to avoid pydantic ValidationError
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
    title = title_from_filename(file.filename or "")[:MAX_TITLE_LENGTH]
    data = DocumentCreate(title=title, content=content)
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

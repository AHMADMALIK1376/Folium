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

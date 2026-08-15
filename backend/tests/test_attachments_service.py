"""The attachment rules, which are pure and need no database."""

import uuid

import pytest

from app.core.exceptions import ValidationError
from app.services.attachments import (
    CONTENT_TYPES,
    MAX_BYTES,
    MAX_PER_DOCUMENT,
    content_type_for,
    storage_path,
)


def test_the_type_comes_from_the_extension():
    assert content_type_for("photo.png") == "image/png"
    assert content_type_for("scan.pdf") == "application/pdf"
    assert content_type_for("notes.md") == "text/markdown"


def test_the_extension_is_matched_case_insensitively():
    """Windows and phone cameras both produce upper-case extensions."""
    assert content_type_for("PHOTO.PNG") == "image/png"
    assert content_type_for("Scan.PDF") == "application/pdf"


def test_jpg_and_jpeg_are_the_same_type():
    assert content_type_for("a.jpg") == content_type_for("b.jpeg") == "image/jpeg"


def test_svg_is_refused_deliberately():
    """It is an image, and its absence from the list is a decision rather than
    an oversight: SVG can carry script, and these files are served from a URL
    the user is invited to open."""
    assert ".svg" not in CONTENT_TYPES
    with pytest.raises(ValidationError):
        content_type_for("drawing.svg")


def test_executables_and_unknown_types_are_refused():
    for name in ["run.exe", "lib.dll", "script.sh", "archive.zip", "page.html"]:
        with pytest.raises(ValidationError):
            content_type_for(name)


def test_a_name_with_no_extension_is_refused():
    with pytest.raises(ValidationError):
        content_type_for("README")


def test_an_empty_name_is_refused_rather_than_crashing():
    with pytest.raises(ValidationError):
        content_type_for("")


def test_a_double_extension_is_judged_by_the_last_one():
    """"payload.png.exe" is an executable, and naming it otherwise is the
    oldest trick there is."""
    with pytest.raises(ValidationError):
        content_type_for("payload.png.exe")


def test_the_path_contains_nothing_the_user_typed():
    document_id, attachment_id = uuid.uuid4(), uuid.uuid4()

    path = storage_path(document_id, attachment_id, "holiday photo.png")

    assert path == f"{document_id}/{attachment_id}.png"
    assert "holiday" not in path


def test_the_path_cannot_be_escaped_by_a_hostile_filename():
    """Building a path from a supplied name is how traversal happens. Only the
    suffix is taken, and the ids do the identifying."""
    path = storage_path(uuid.uuid4(), uuid.uuid4(), "../../../../etc/passwd.png")

    assert ".." not in path
    assert path.count("/") == 1


def test_the_limits_are_the_documented_ones():
    assert MAX_BYTES == 10 * 1024 * 1024
    assert MAX_PER_DOCUMENT == 20

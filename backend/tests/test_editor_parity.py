"""The test that stops Phase 6-i's bug happening again.

`StarterKit` enabled blockquote and codeBlock from Phase 1. The converter handled
four block types and skipped everything else in silence, so a document whose body
was a quote exported as an empty file — for months, past a definition of done
that included "an empty document still exports something".

Nothing was wrong with the code that could be seen by reading it. What was
missing was anything asserting that the editor's schema and the converter agree.
This is that assertion, and it is deliberately structural rather than a list of
examples: it reads the shared contract in editor-schema.json, so enabling a new
extension fails here until someone decides what export should do with it.

The other half of the loop lives in
frontend/src/components/editor/editorSchema.test.ts, which asserts the editor
really does produce exactly the names in that file.
"""

import json
from pathlib import Path

import pytest

from app.utils.import_file import doc_to_markdown, markdown_to_doc

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "editor-schema.json").read_text("utf-8"))
EXCLUDED = SCHEMA["excluded"]

NODE_SAMPLES: dict[str, dict] = {
    "paragraph": {"type": "paragraph", "content": [{"type": "text", "text": "Body"}]},
    "heading": {
        "type": "heading",
        "attrs": {"level": 2},
        "content": [{"type": "text", "text": "Title"}],
    },
    "bulletList": {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Item"}]}
                ],
            }
        ],
    },
    "orderedList": {
        "type": "orderedList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Item"}]}
                ],
            }
        ],
    },
    "blockquote": {
        "type": "blockquote",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Quoted"}]}],
    },
    # `attrs` is not decoration: TipTap's codeBlock always carries a language
    # attribute, null when unset, so a sample without one is not a document the
    # editor could ever produce.
    "codeBlock": {
        "type": "codeBlock",
        "attrs": {"language": None},
        "content": [{"type": "text", "text": "print(1)"}],
    },
    "horizontalRule": {"type": "horizontalRule"},
    "hardBreak": {
        "type": "paragraph",
        "content": [
            {"type": "text", "text": "one"},
            {"type": "hardBreak"},
            {"type": "text", "text": "two"},
        ],
    },
    "taskList": {
        "type": "taskList",
        "content": [
            {
                "type": "taskItem",
                "attrs": {"checked": False},
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Buy milk"}]}
                ],
            },
            {
                "type": "taskItem",
                "attrs": {"checked": True},
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Done already"}]}
                ],
            },
        ],
    },
}

def _marked(name: str, attrs: dict | None = None) -> dict:
    mark: dict = {"type": name}
    if attrs:
        mark["attrs"] = attrs
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": "marked", "marks": [mark]}],
    }


# A link without an href is not a link, so the generic sample cannot cover it.
MARK_ATTRS: dict[str, dict] = {"link": {"href": "https://example.com"}}

MARK_SAMPLES: dict[str, dict] = {
    name: _marked(name, MARK_ATTRS.get(name)) for name in SCHEMA["marks"]
}


def _convertible(name: str) -> bool:
    return name not in EXCLUDED


@pytest.mark.parametrize("name", SCHEMA["nodes"])
def test_every_node_is_converted_or_explicitly_excluded(name):
    if not _convertible(name):
        assert EXCLUDED[name], f"{name} is excluded but gives no reason"
        return

    assert name in NODE_SAMPLES, (
        f"{name!r} is in the editor's schema but this test has no sample for it. "
        "Add one, then make doc_to_markdown handle it — or add it to `excluded` "
        "in editor-schema.json with a reason."
    )

    result = doc_to_markdown({"type": "doc", "content": [NODE_SAMPLES[name]]})

    # The original bug in one line: a blockquote produced "" and nobody noticed.
    assert result.strip() != "", f"{name} exports as nothing — its content is being dropped"


@pytest.mark.parametrize("name", SCHEMA["marks"])
def test_every_mark_survives_export(name):
    if not _convertible(name):
        return

    result = doc_to_markdown({"type": "doc", "content": [MARK_SAMPLES[name]]})

    assert "marked" in result, f"{name} lost its text"
    assert result.strip() != "marked", (
        f"{name} exports as bare text — the formatting is silently dropped"
    )


@pytest.mark.parametrize("name", [n for n in SCHEMA["nodes"] if n not in EXCLUDED])
def test_every_node_survives_a_round_trip(name):
    """Export then re-import must reproduce the document.

    Stronger than "exports as something": a blockquote that exported as a plain
    paragraph would pass the test above and still lose the quote.
    """
    original = {"type": "doc", "content": [NODE_SAMPLES[name]]}

    assert markdown_to_doc(doc_to_markdown(original)) == original, (
        f"{name} does not survive export and re-import"
    )


@pytest.mark.parametrize("name", SCHEMA["marks"])
def test_every_mark_survives_a_round_trip(name):
    original = {"type": "doc", "content": [MARK_SAMPLES[name]]}

    assert markdown_to_doc(doc_to_markdown(original)) == original, (
        f"{name} does not survive export and re-import"
    )

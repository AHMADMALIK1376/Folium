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
LOSSY = SCHEMA["lossy"]

NODE_SAMPLES: dict[str, dict] = {
    "paragraph": {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Body"}]},
    "heading": {
        "type": "heading",
        "attrs": {"level": 2, "textAlign": None},
        "content": [{"type": "text", "text": "Title"}],
    },
    "bulletList": {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Item"}]}
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
                    {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Item"}]}
                ],
            }
        ],
    },
    "blockquote": {
        "type": "blockquote",
        "content": [{"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Quoted"}]}],
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
    "image": {
        "type": "image",
        "attrs": {
            "src": "/api/v1/documents/abc/attachments/def/raw",
            "alt": "A diagram",
            "title": None,
        },
    },
    "hardBreak": {
        "type": "paragraph",
        "attrs": {"textAlign": None},
        "content": [
            {"type": "text", "text": "one"},
            {"type": "hardBreak"},
            {"type": "text", "text": "two"},
        ],
    },
    "table": {
        "type": "table",
        "content": [
            {
                "type": "tableRow",
                "content": [
                    {
                        "type": "tableHeader",
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                        "content": [
                            {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Name"}]}
                        ],
                    },
                    {
                        "type": "tableHeader",
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                        "content": [
                            {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Role"}]}
                        ],
                    },
                ],
            },
            {
                "type": "tableRow",
                "content": [
                    {
                        "type": "tableCell",
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                        "content": [
                            {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Ana"}]}
                        ],
                    },
                    {
                        "type": "tableCell",
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                        "content": [
                            {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Lead"}]}
                        ],
                    },
                ],
            },
        ],
    },
    "taskList": {
        "type": "taskList",
        "content": [
            {
                "type": "taskItem",
                "attrs": {"checked": False},
                "content": [
                    {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Buy milk"}]}
                ],
            },
            {
                "type": "taskItem",
                "attrs": {"checked": True},
                "content": [
                    {"type": "paragraph", "attrs": {"textAlign": None}, "content": [{"type": "text", "text": "Done already"}]}
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
        "attrs": {"textAlign": None},
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
    if not _convertible(name) or name in LOSSY:
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


@pytest.mark.parametrize("name", [m for m in SCHEMA["marks"] if m not in LOSSY])
def test_every_mark_survives_a_round_trip(name):
    original = {"type": "doc", "content": [MARK_SAMPLES[name]]}

    assert markdown_to_doc(doc_to_markdown(original)) == original, (
        f"{name} does not survive export and re-import"
    )


# --- Combined marks ---
#
# The gap that let bold+italic corrupt a document for the life of the project:
# every test above applies exactly ONE mark, so no combination was ever
# exercised in either direction. `***important***` came back as the text
# "*important" carrying only bold — a character lost and a stray asterisk
# gained, in the author's prose.

COMBINABLE = [
    name for name in SCHEMA["marks"] if name not in ("code", "link") and name not in LOSSY
]

PAIRS = [(a, b) for i, a in enumerate(COMBINABLE) for b in COMBINABLE[i + 1 :]]


def _combined(names: tuple[str, ...]) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"textAlign": None},
                "content": [
                    {
                        "type": "text",
                        "text": "important",
                        "marks": [{"type": name} for name in names],
                    }
                ],
            }
        ],
    }


@pytest.mark.parametrize("pair", PAIRS, ids=lambda p: "+".join(p))
def test_two_marks_together_survive_a_round_trip(pair):
    """The text and every mark, not one of them.

    Compared as a set: ProseMirror treats a node's marks as unordered, and the
    converters have no way to know the order the editor happened to store them
    in. Losing a mark, or leaving syntax stranded in the text, is the failure
    this catches.
    """
    original = _combined(pair)
    result = markdown_to_doc(doc_to_markdown(original))

    [node] = result["content"][0]["content"]

    assert node["text"] == "important", "syntax was left stranded in the text"
    assert {m["type"] for m in node.get("marks", [])} == set(pair)


def test_three_marks_together_survive_a_round_trip():
    original = _combined(("bold", "italic", "underline"))
    [node] = markdown_to_doc(doc_to_markdown(original))["content"][0]["content"]

    assert node["text"] == "important"
    assert {m["type"] for m in node.get("marks", [])} == {"bold", "italic", "underline"}


def test_a_link_can_also_be_bold():
    original = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"textAlign": None},
                "content": [
                    {
                        "type": "text",
                        "text": "the docs",
                        "marks": [
                            {"type": "link", "attrs": {"href": "https://example.com"}},
                            {"type": "bold"},
                        ],
                    }
                ],
            }
        ],
    }

    [node] = markdown_to_doc(doc_to_markdown(original))["content"][0]["content"]

    assert node["text"] == "the docs"
    assert {m["type"] for m in node.get("marks", [])} == {"link", "bold"}


def test_code_is_never_combined_with_emphasis():
    """Deliberate: a backtick span's content is literal, so `**a**` inside one
    is code containing asterisks. Bold applied to a code span cannot be
    expressed in Markdown, and inventing a spelling would break the round trip
    in the other direction."""
    original = _combined(("code", "bold"))
    [node] = markdown_to_doc(doc_to_markdown(original))["content"][0]["content"]

    assert node["text"] == "important"
    assert {m["type"] for m in node.get("marks", [])} == {"code"}


# --- Formatting Markdown cannot carry ---
#
# Phase 9 changed the policy: colour, font and alignment are supported in the
# editor and accepted as lost on Markdown export, because Markdown has no
# spelling for any of them and TipTap JSON is the record of truth.
#
# The promise is therefore different, not absent. These must drop CLEANLY — the
# author's words survive, only the formatting goes. Silently mangling the text
# is the bug shape that bit three times in Phase 6, and it is what these catch.


@pytest.mark.parametrize("name", sorted(LOSSY))
def test_lossy_formatting_is_named_with_a_reason(name):
    assert LOSSY[name], f"{name} is listed as lossy but gives no reason"


def test_a_coloured_run_keeps_its_words():
    original = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"textAlign": None},
                "content": [
                    {
                        "type": "text",
                        "text": "important",
                        "marks": [
                            {"type": "textStyle", "attrs": {"color": "#d41f26"}},
                            {"type": "bold"},
                        ],
                    }
                ],
            }
        ],
    }

    exported = doc_to_markdown(original)
    [node] = markdown_to_doc(exported)["content"][0]["content"]

    # The colour is gone, which is the accepted trade.
    assert not any(m["type"] == "textStyle" for m in node.get("marks", []))
    # The words and every mark Markdown CAN carry are not.
    assert node["text"] == "important"
    assert {m["type"] for m in node.get("marks", [])} == {"bold"}
    assert "textStyle" not in exported and "color" not in exported


def test_an_aligned_paragraph_keeps_its_words():
    original = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"textAlign": "center"},
                "content": [{"type": "text", "text": "centred text"}],
            }
        ],
    }

    result = markdown_to_doc(doc_to_markdown(original))

    assert result["content"][0]["content"][0]["text"] == "centred text"
    # Back to the default, not carrying a bogus value through.
    assert result["content"][0]["attrs"]["textAlign"] is None

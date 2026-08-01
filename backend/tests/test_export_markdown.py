"""Converting a TipTap document back to Markdown.

The inverse of `markdown_to_doc`, and tested against it: the round-trip test at
the bottom is the one that keeps the pair honest, because a converter is exactly
where quiet asymmetries live.
"""

from app.utils.import_file import doc_to_markdown, markdown_to_doc


def doc(*blocks) -> dict:
    return {"type": "doc", "content": list(blocks)}


def text(value: str, mark: str | None = None) -> dict:
    node: dict = {"type": "text", "text": value}
    if mark:
        node["marks"] = [{"type": mark}]
    return node


def paragraph(*children) -> dict:
    return {"type": "paragraph", "content": list(children)}


def test_headings_use_one_hash_per_level():
    result = doc_to_markdown(
        doc(
            {"type": "heading", "attrs": {"level": 1}, "content": [text("One")]},
            {"type": "heading", "attrs": {"level": 2}, "content": [text("Two")]},
            {"type": "heading", "attrs": {"level": 3}, "content": [text("Three")]},
        )
    )

    assert "# One" in result
    assert "## Two" in result
    assert "### Three" in result


def test_paragraphs_are_separated_by_a_blank_line():
    result = doc_to_markdown(doc(paragraph(text("First")), paragraph(text("Second"))))

    assert result == "First\n\nSecond"


def test_bold_and_italic_use_asterisks():
    result = doc_to_markdown(
        doc(paragraph(text("plain "), text("strong", "bold"), text(" and "), text("slanted", "italic")))
    )

    assert "**strong**" in result
    assert "*slanted*" in result


def test_underline_becomes_a_tag_because_markdown_has_none():
    """The editor offers underline and Markdown cannot express it.

    Dropping it silently would lose something the author deliberately applied.
    """
    result = doc_to_markdown(doc(paragraph(text("under", "underline"))))

    assert "<u>under</u>" in result


def test_bullet_items_use_dashes():
    result = doc_to_markdown(
        doc(
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [paragraph(text("one"))]},
                    {"type": "listItem", "content": [paragraph(text("two"))]},
                ],
            }
        )
    )

    assert result == "- one\n- two"


def test_ordered_items_are_numbered_in_sequence():
    result = doc_to_markdown(
        doc(
            {
                "type": "orderedList",
                "content": [
                    {"type": "listItem", "content": [paragraph(text("one"))]},
                    {"type": "listItem", "content": [paragraph(text("two"))]},
                    {"type": "listItem", "content": [paragraph(text("three"))]},
                ],
            }
        )
    )

    # Not "1." three times: re-importing that still yields three items, but the
    # file is what a person reads, and 1/1/1 reads as a mistake.
    assert result == "1. one\n2. two\n3. three"


def test_asterisks_in_text_are_escaped():
    """Otherwise re-importing turns the author's punctuation into emphasis."""
    result = doc_to_markdown(doc(paragraph(text("a * b"))))

    assert result == "a \\* b"


def test_a_line_that_looks_like_a_heading_is_escaped():
    """A paragraph beginning "# " would come back as a heading otherwise."""
    result = doc_to_markdown(doc(paragraph(text("# not a heading"))))

    assert result.startswith("\\#")


def test_a_line_that_looks_like_a_list_item_is_escaped():
    assert doc_to_markdown(doc(paragraph(text("- not a list")))).startswith("\\-")
    assert doc_to_markdown(doc(paragraph(text("1. not a list")))).startswith("1\\.")


def test_an_empty_document_converts_to_an_empty_string():
    assert doc_to_markdown({"type": "doc", "content": []}) == ""
    assert doc_to_markdown({"type": "doc"}) == ""


def test_malformed_input_does_not_raise():
    """Matches doc_to_plain_text's defensiveness. The schema layer validates
    first, so this is belt-and-braces rather than a real code path."""
    assert doc_to_markdown({"type": "doc", "content": "not a list"}) == ""
    assert doc_to_markdown({"type": "doc", "content": ["not a dict"]}) == ""
    assert doc_to_markdown({}) == ""


ROUND_TRIP_SOURCE = """# A heading

Some **bold** and some *italic* text.

## A subheading

- first item
- second item

1. one
2. two

A paragraph with an \\* asterisk in it.
"""


def test_markdown_survives_a_round_trip():
    """Import, export, import again — and land on the same document.

    Import and export are the only pair in this codebase that must agree
    exactly. If they ever disagree, the converter is wrong, not this test.
    """
    original = markdown_to_doc(ROUND_TRIP_SOURCE)

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_the_round_trip_preserves_an_asterisk_as_text():
    original = markdown_to_doc("A literal \\* stays literal.")
    round_tripped = markdown_to_doc(doc_to_markdown(original))

    assert round_tripped == original
    # And the text really is a bare asterisk, not an escape sequence left behind.
    assert "*" in round_tripped["content"][0]["content"][0]["text"]
    assert "\\" not in round_tripped["content"][0]["content"][0]["text"]

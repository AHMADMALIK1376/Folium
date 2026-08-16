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


# --- Phase 6-i: the types StarterKit always allowed and export always dropped ---


def code_block(code: str, language=None) -> dict:
    return {
        "type": "codeBlock",
        "attrs": {"language": language},
        "content": [{"type": "text", "text": code}] if code else [],
    }


def test_a_blockquote_is_not_swallowed():
    """The bug this phase exists for: a document made of a quote exported as an
    empty file, and had done since Phase 1."""
    result = doc_to_markdown(
        doc({"type": "blockquote", "content": [paragraph(text("Quoted words"))]})
    )

    assert result == "> Quoted words"


def test_a_multi_paragraph_quote_keeps_both_paragraphs():
    result = doc_to_markdown(
        doc(
            {
                "type": "blockquote",
                "content": [paragraph(text("First")), paragraph(text("Second"))],
            }
        )
    )

    assert "> First" in result
    assert "> Second" in result


def test_a_code_block_is_not_swallowed():
    assert doc_to_markdown(doc(code_block("print(1)"))) == "```\nprint(1)\n```"


def test_a_code_block_keeps_its_language():
    assert doc_to_markdown(doc(code_block("print(1)", "python"))).startswith("```python")


def test_an_empty_code_block_is_still_a_fence():
    """Not an empty string, which would vanish on re-import."""
    assert doc_to_markdown(doc(code_block(""))) == "```\n\n```"


def test_a_fence_grows_past_backticks_in_the_code():
    """A sample containing ``` would otherwise close the block early and spill
    the rest of the document into it."""
    result = doc_to_markdown(doc(code_block("here is ``` a fence")))

    assert result.startswith("````")
    assert result.endswith("````")
    assert markdown_to_doc(result) == doc(code_block("here is ``` a fence"))


def test_markdown_inside_a_code_block_is_not_escaped():
    """A backslash added to someone's code changes the code."""
    result = doc_to_markdown(doc(code_block("weight = a ** b  # ** not bold")))

    assert r"\*" not in result
    assert "a ** b" in result


def test_markdown_inside_an_inline_code_span_is_not_escaped():
    result = doc_to_markdown(doc(paragraph(text("call ", None), text("a*b", "code"))))

    assert "`a*b`" in result
    assert r"\*" not in result


def test_strikethrough_survives():
    assert doc_to_markdown(doc(paragraph(text("gone", "strike")))) == "~~gone~~"


def test_a_horizontal_rule_survives():
    assert doc_to_markdown(doc({"type": "horizontalRule"})) == "---"


def test_a_hard_break_does_not_merge_the_lines():
    result = doc_to_markdown(
        doc({"type": "paragraph", "content": [text("one"), {"type": "hardBreak"}, text("two")]})
    )

    # A backslash, then a newline: Markdown's unambiguous line break.
    assert result == "one\\\ntwo"
    assert "onetwo" not in result


def test_underline_survives_a_round_trip():
    """It exported correctly from Phase 5-i but came back as literal <u> text,
    because the round-trip test started from Markdown and the importer could
    never produce an underline to begin with."""
    original = doc(paragraph(text("stressed", "underline")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


RICH_ROUND_TRIP_SOURCE = """# A heading

> A quoted line

```python
weight = a ** b  # ** is not bold, and this # is not a heading
```

Some ~~struck~~ text with `a*b` inline code.

---

A line\
broken in two.
"""


def test_the_richer_round_trip_holds():
    """The types Phase 6-i added, through import, export, and import again."""
    original = markdown_to_doc(RICH_ROUND_TRIP_SOURCE)

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_markdown_inside_a_fence_is_never_parsed():
    original = markdown_to_doc("```\n# not a heading\n- not a list\n```")
    [block] = original["content"]

    assert block["type"] == "codeBlock"
    assert block["content"][0]["text"] == "# not a heading\n- not a list"


def test_a_rule_is_not_read_as_a_bullet():
    [block] = markdown_to_doc("---")["content"]

    assert block["type"] == "horizontalRule"


def test_a_paragraph_that_looks_like_a_rule_stays_a_paragraph():
    original = doc(paragraph(text("---")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


# --- Phase 6-ii: links and task lists ---


def link(text_value: str, href: str) -> dict:
    return {
        "type": "text",
        "text": text_value,
        "marks": [{"type": "link", "attrs": {"href": href}}],
    }


def task_list(*items) -> dict:
    return {"type": "taskList", "content": list(items)}


def task(text_value: str, checked: bool) -> dict:
    return {
        "type": "taskItem",
        "attrs": {"checked": checked},
        "content": [paragraph(text(text_value))],
    }


def test_a_link_becomes_markdown():
    result = doc_to_markdown(doc(paragraph(link("the docs", "https://example.com"))))

    assert result == "[the docs](https://example.com)"


def test_a_link_survives_a_round_trip():
    original = doc(paragraph(link("the docs", "https://example.com")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_a_mailto_link_is_allowed():
    original = doc(paragraph(link("write to me", "mailto:a@example.com")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_a_relative_link_is_allowed():
    """No scheme means relative, which cannot execute anything."""
    original = doc(paragraph(link("about", "/about")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_square_brackets_in_text_survive():
    original = doc(paragraph(text("an [aside] in brackets")))

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_square_brackets_inside_code_are_not_escaped():
    result = doc_to_markdown(doc(paragraph(text("items[0]", "code"))))

    assert "`items[0]`" in result
    assert r"\[" not in result


def test_a_javascript_url_is_refused_on_import():
    """The security case. A link is the first content type where the author
    supplies something the READER's browser will act on, and a viewer may only
    have been given permission to read."""
    result = markdown_to_doc("[click me](javascript:alert(1))")

    [para] = result["content"]
    [node] = para["content"]
    # The words survive; only the mark is dropped. Discarding the sentence would
    # be a second bug on top of the one being prevented.
    assert node["text"] == "click me"
    assert "marks" not in node


def test_other_dangerous_schemes_are_refused():
    for url in ["data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)", "JavaScript:alert(1)"]:
        [para] = markdown_to_doc(f"[x]({url})")["content"]
        [node] = para["content"]
        assert "marks" not in node, f"{url} was allowed through"


def test_a_task_list_becomes_checkboxes():
    result = doc_to_markdown(doc(task_list(task("Buy milk", False), task("Call Ana", True))))

    assert result == "- [ ] Buy milk\n- [x] Call Ana"


def test_a_task_list_survives_a_round_trip():
    original = doc(task_list(task("Buy milk", False), task("Call Ana", True)))

    assert markdown_to_doc(doc_to_markdown(original)) == original


def test_a_task_item_is_not_read_as_a_bullet():
    """BULLET_RE matches "- [ ] milk" too, whose text would be "[ ] milk" — a
    checklist quietly demoted to a list. Order is the whole argument."""
    [block] = markdown_to_doc("- [ ] milk")["content"]

    assert block["type"] == "taskList"
    assert block["content"][0]["attrs"]["checked"] is False


def test_an_uppercase_x_is_checked():
    [block] = markdown_to_doc("- [X] done")["content"]

    assert block["content"][0]["attrs"]["checked"] is True


def test_a_bullet_list_and_a_task_list_stay_separate():
    content = markdown_to_doc("- plain item\n- [ ] a task")["content"]

    assert [block["type"] for block in content] == ["bulletList", "taskList"]


def test_a_paragraph_beginning_with_brackets_is_not_a_task():
    original = doc(paragraph(text("[ ] not a checkbox")))

    assert markdown_to_doc(doc_to_markdown(original)) == original

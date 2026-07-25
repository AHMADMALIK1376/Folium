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

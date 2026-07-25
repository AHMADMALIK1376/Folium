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

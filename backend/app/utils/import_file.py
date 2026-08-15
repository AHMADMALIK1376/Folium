import re
from typing import Any

from app.core.constants import empty_doc

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
NUMBERED_RE = re.compile(r"^\d+\.\s+(.*)$")
BOLD_RE = re.compile(r"(?<!\\)\*\*(.+?)(?<!\\)\*\*")
ITALIC_RE = re.compile(r"(?<!\\)(?<!\*)\*(?!\*)(.+?)(?<!\\)\*(?!\*)")

# Only what this pair would otherwise misread: a backslash, the emphasis
# marker, and the three characters that give a line a meaning of its own.
# Escaping more would make exported files uglier without making them safer,
# because nothing else here is a delimiter.
ESCAPED_RE = re.compile(r"\\([\\*#\-.])")


def _unescape(text: str) -> str:
    r"""Turn `\*` back into `*`.

    The importer needs this because the exporter escapes. Without it a round
    trip through Markdown strands backslashes in the text, and the document
    that comes back is not the one that went out.
    """
    return ESCAPED_RE.sub(r"\1", text)


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
            nodes.append(_text_node(_unescape(text[pos : match.start()])))
        if match.group(2) is not None:
            nodes.append(_text_node(_unescape(match.group(2)), "bold"))
        else:
            nodes.append(_text_node(_unescape(match.group(4)), "italic"))
        pos = match.end()

    if pos < len(text):
        nodes.append(_text_node(_unescape(text[pos:])))

    if not nodes and text:
        nodes.append(_text_node(_unescape(text)))

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
    """Flatten a TipTap document to plain text, one line per block node.

    Defensive against malformed shapes (non-dict nodes, non-list `content`)
    even though the schema layer validates content first — belt-and-braces
    so this can never raise on unexpected input.
    """
    lines: list[str] = []

    def walk(node: dict[str, Any]) -> str:
        if not isinstance(node, dict):
            return ""
        if node.get("type") == "text":
            return node.get("text", "")
        content = node.get("content")
        if not isinstance(content, list):
            return ""
        return "".join(walk(child) for child in content)

    block_content = doc.get("content")
    if not isinstance(block_content, list):
        block_content = []

    for block in block_content:
        if not isinstance(block, dict):
            continue
        if block.get("type") in ("bulletList", "orderedList"):
            item_content = block.get("content")
            if not isinstance(item_content, list):
                item_content = []
            for item in item_content:
                if not isinstance(item, dict):
                    continue
                text = walk(item).strip()
                if text:
                    lines.append(text)
        else:
            text = walk(block).strip()
            if text:
                lines.append(text)

    return "\n".join(lines)


# Escaped on the way out so the importer reads them back as text rather than as
# formatting. Kept to exactly what `_unescape` reverses — the two must agree, or
# a round trip loses characters.
_INLINE_ESCAPES = str.maketrans({"\\": "\\\\", "*": "\\*"})

# A line beginning with one of these means something to the importer, so a
# paragraph that happens to start that way has its first character escaped.
_LINE_STARTERS = ("#", "-")


def _escape_inline(text: str) -> str:
    return text.translate(_INLINE_ESCAPES)


def _escape_line_start(line: str) -> str:
    """Stop a paragraph from being re-read as a heading or a list item."""
    for starter in _LINE_STARTERS:
        if line.startswith(starter):
            return "\\" + line
    # "1. " would come back as an ordered list, so the dot is escaped rather
    # than the digit — escaping a digit means nothing to Markdown.
    if NUMBERED_RE.match(line):
        number, _, rest = line.partition(".")
        return f"{number}\\.{rest}"
    return line


def _marks_of(node: dict[str, Any]) -> set[str]:
    marks = node.get("marks")
    if not isinstance(marks, list):
        return set()
    return {m.get("type") for m in marks if isinstance(m, dict)}


def _inline_to_markdown(nodes: Any) -> str:
    """Render text nodes, wrapping each in the syntax for its marks."""
    if not isinstance(nodes, list):
        return ""

    out: list[str] = []
    for node in nodes:
        if not isinstance(node, dict) or node.get("type") != "text":
            continue

        text = _escape_inline(str(node.get("text", "")))
        marks = _marks_of(node)

        # Innermost first, so **_both_** nests rather than interleaving.
        if "italic" in marks:
            text = f"*{text}*"
        if "bold" in marks:
            text = f"**{text}**"
        # Markdown cannot express underline, and the editor offers it. Dropping
        # it would silently lose something the author deliberately applied.
        if "underline" in marks:
            text = f"<u>{text}</u>"

        out.append(text)

    return "".join(out)


def _list_item_text(item: Any) -> str:
    """A list item holds a paragraph; the marker is added by the caller."""
    if not isinstance(item, dict):
        return ""
    children = item.get("content")
    if not isinstance(children, list):
        return ""
    return " ".join(
        _inline_to_markdown(child.get("content"))
        for child in children
        if isinstance(child, dict)
    ).strip()


def doc_to_markdown(doc: dict[str, Any]) -> str:
    """Convert a TipTap document to the Markdown subset the importer reads.

    The inverse of `markdown_to_doc`, and deliberately no more capable than it:
    the pair is tested by round-tripping, so anything emitted here that the
    importer cannot read would show up as a failure rather than as a surprise
    for whoever re-imports the file.

    Defensive against malformed shapes for the same reason `doc_to_plain_text`
    is — the schema layer validates first, so this is belt-and-braces.
    """
    blocks = doc.get("content") if isinstance(doc, dict) else None
    if not isinstance(blocks, list):
        return ""

    chunks: list[str] = []

    for block in blocks:
        if not isinstance(block, dict):
            continue

        kind = block.get("type")

        if kind == "heading":
            attrs = block.get("attrs")
            level = attrs.get("level", 1) if isinstance(attrs, dict) else 1
            level = min(max(int(level), 1), 3)
            chunks.append(f"{'#' * level} {_inline_to_markdown(block.get('content'))}")

        elif kind == "paragraph":
            chunks.append(_escape_line_start(_inline_to_markdown(block.get("content"))))

        elif kind == "bulletList":
            items = block.get("content")
            items = items if isinstance(items, list) else []
            chunks.append("\n".join(f"- {_list_item_text(item)}" for item in items))

        elif kind == "orderedList":
            items = block.get("content")
            items = items if isinstance(items, list) else []
            # Numbered in sequence rather than "1." repeated: re-importing is
            # identical either way, but a person reads this file.
            chunks.append(
                "\n".join(
                    f"{index}. {_list_item_text(item)}"
                    for index, item in enumerate(items, start=1)
                )
            )

    return "\n\n".join(chunk for chunk in chunks if chunk != "").strip()


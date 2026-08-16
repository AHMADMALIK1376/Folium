import re
from typing import Any

from app.core.constants import empty_doc

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
NUMBERED_RE = re.compile(r"^\d+\.\s+(.*)$")
BOLD_RE = re.compile(r"(?<!\\)\*\*(.+?)(?<!\\)\*\*")
ITALIC_RE = re.compile(r"(?<!\\)(?<!\*)\*(?!\*)(.+?)(?<!\\)\*(?!\*)")
QUOTE_RE = re.compile(r"^>\s?(.*)$")
FENCE_RE = re.compile(r"^(`{3,})(.*)$")
RULE_RE = re.compile(r"^(?:-{3,}|\*{3,}|_{3,})$")
# Checked before BULLET_RE, always: "- [ ] milk" also matches a bullet, whose
# text would then be "[ ] milk" — a checklist quietly demoted to a list.
TASK_RE = re.compile(r"^[-*]\s+\[([ xX])\]\s+(.*)$")
# A table row is any line with a pipe that is not escaped. The delimiter row —
# |---|:--:| — is what actually makes it a table in GFM; without one it is
# paragraphs that happen to contain pipes, so both are required.
ROW_RE = re.compile(r"^\s*\|(.+)\|\s*$")
DELIMITER_RE = re.compile(r"^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$")

# The protocols a link may use, mirrored in frontend/src/lib/editor/extensions.ts
# and enforced in both. A `.md` file is untrusted input and this importer is a
# second door into the same document, so a filter that lived only in the browser
# would be decoration.
#
# `javascript:` in an href is script execution in the *reader's* session, on a
# document they may only be allowed to view. That is stored XSS in a
# collaborative editor, which is the worst shape it comes in.
ALLOWED_PROTOCOLS = ("http", "https", "mailto")

_SCHEME_RE = re.compile(r"^([a-zA-Z][a-zA-Z0-9+.-]*):")


def is_safe_url(url: str) -> bool:
    """Whether a link target may be stored.

    A URL with no scheme is relative and allowed. Anything naming a scheme must
    name one on the list — an allow-list rather than a block-list, because
    `javascript:` has as many spellings as there are ways to hide a colon.
    """
    scheme = _SCHEME_RE.match((url or "").strip())
    if scheme is None:
        return True

    return scheme.group(1).lower() in ALLOWED_PROTOCOLS

# Every delimiter this module can misread, and nothing more. Adding a character
# here means adding it to ESCAPED_RE too: the two must reverse each other
# exactly, or a round trip loses text.
ESCAPED_RE = re.compile(r"\\([\\*#\-.`~>\[\]])")

# Marks, in the order they must be matched.
#
# `code` comes first and wins, because its content is literal: a backtick span
# containing ** is code that happens to contain asterisks, not bold. Underline
# precedes the emphasis markers for the same reason — <u> is HTML this module
# emits itself, and leaving it to be picked apart by * matching would corrupt it.
_INLINE_PATTERN = re.compile(
    r"(?P<code>(?<!\\)`(?P<code_text>[^`]+)`)"
    r"|(?P<link>(?<!\\)\[(?P<link_text>[^\]]*)\]\((?P<link_href>[^)]*)\))"
    r"|(?P<underline><u>(?P<underline_text>.+?)</u>)"
    # Before bold, and it has to be its own alternative rather than falling out
    # of bold-then-italic. On "***x***" the bold pattern's non-greedy body stops
    # at the first "**" it can, capturing "*x" and stranding the closing
    # asterisk in the text — which is exactly how bold+italic came back corrupted.
    r"|(?P<bolditalic>(?<!\\)\*\*\*(?P<bolditalic_text>.+?)(?<!\\)\*\*\*)"
    r"|(?P<bold>(?<!\\)\*\*(?P<bold_text>.+?)(?<!\\)\*\*)"
    r"|(?P<strike>(?<!\\)~~(?P<strike_text>.+?)(?<!\\)~~)"
    r"|(?P<italic>(?<!\\)(?<!\*)\*(?!\*)(?P<italic_text>.+?)(?<!\\)\*(?!\*))"
)

_MARK_NAMES = ("code", "link", "underline", "bolditalic", "bold", "strike", "italic")


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


def _marked_node(text: str, marks: tuple[dict[str, Any], ...]) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": text}
    if marks:
        node["marks"] = [dict(mark) for mark in marks]
    return node


def _inline(text: str, marks: tuple[dict[str, Any], ...] = ()) -> list[dict[str, Any]]:
    """Split a line into TipTap text nodes, applying marks.

    Recursive, and that is the whole point: a run can carry more than one mark.
    Before this recursed, `***important***` matched bold and kept `*important*`
    as literal text, so a run that was bold *and* italic came back from a round
    trip with visible asterisks in the prose. Every combination was lossy — the
    same class of silent corruption as Phase 6-i, and missed for the same
    reason: nothing tested more than one mark at a time.

    Bold is matched before italic so `**` is never read as a pair of single
    asterisks, and code before everything, because its content is literal.
    """
    nodes: list[dict[str, Any]] = []
    pos = 0

    for match in _INLINE_PATTERN.finditer(text):
        if match.start() > pos:
            nodes.append(_marked_node(_unescape(text[pos : match.start()]), marks))

        for name in _MARK_NAMES:
            if match.group(name) is None:
                continue

            body = match.group(f"{name}_text")

            if name == "code":
                # Never recursed into and never unescaped: the content is
                # literal, so `**a**` inside backticks is code that contains
                # asterisks rather than bold.
                nodes.append(_marked_node(body, (*marks, {"type": "code"})))

            elif name == "link":
                href = _unescape(match.group("link_href").strip())
                if is_safe_url(href):
                    nodes.extend(
                        _inline(body, (*marks, {"type": "link", "attrs": {"href": href}}))
                    )
                else:
                    # The mark is dropped, the words are kept. Discarding the
                    # text as well would lose an author's sentence to a URL they
                    # may not even have written — a second bug on top of the one
                    # being prevented.
                    nodes.extend(_inline(body, marks))

            elif name == "bolditalic":
                # Outermost first, matching the order export applies them in:
                # italic is wrapped by bold, so bold is the outer mark.
                nodes.extend(
                    _inline(body, (*marks, {"type": "bold"}, {"type": "italic"}))
                )

            else:
                nodes.extend(_inline(body, (*marks, {"type": name})))

            break

        pos = match.end()

    if pos < len(text):
        nodes.append(_marked_node(_unescape(text[pos:]), marks))

    if not nodes and text:
        nodes.append(_marked_node(_unescape(text), marks))

    return nodes


def _split_row(line: str) -> list[str]:
    r"""Split "| a | b |" into cells, respecting escaped pipes.

    A `\|` is a pipe the author typed, not a cell boundary — splitting on it
    would silently cut their content in half.
    """
    inner = ROW_RE.match(line).group(1)
    cells: list[str] = []
    current = ""
    index = 0

    while index < len(inner):
        char = inner[index]
        if char == "\\" and index + 1 < len(inner) and inner[index + 1] == "|":
            current += "|"
            index += 2
            continue
        if char == "|":
            cells.append(current.strip())
            current = ""
        else:
            current += char
        index += 1

    cells.append(current.strip())
    return cells


def _alignments(delimiter: str) -> list[str | None]:
    out: list[str | None] = []
    for cell in _split_row(delimiter):
        left, right = cell.startswith(":"), cell.endswith(":")
        out.append("center" if left and right else "right" if right else "left" if left else None)
    return out


def _cell(text: str, header: bool, align: str | None) -> dict[str, Any]:
    # colspan and rowspan are TipTap's own defaults and must be present, or the
    # node this produces is not one the editor could have made — the same trap
    # codeBlock's `language` set in Phase 6-i.
    attrs: dict[str, Any] = {"colspan": 1, "rowspan": 1, "colwidth": None}
    if align:
        attrs["textAlign"] = align
    return {
        "type": "tableHeader" if header else "tableCell",
        "attrs": attrs,
        "content": [_paragraph(text)],
    }


def _paragraph_from_lines(lines: list[str]) -> dict[str, Any]:
    r"""Build one paragraph from lines joined by hard breaks.

    A trailing backslash means "same paragraph, new line" — TipTap's hardBreak.
    Markdown's other spelling is two trailing spaces, which is invisible in a
    diff and stripped by most editors, so the backslash is what this module
    emits and the only one it needs to read.
    """
    content: list[dict[str, Any]] = []

    for index, line in enumerate(lines):
        if index:
            content.append({"type": "hardBreak"})
        content.extend(_inline(line))

    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


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

    index = 0
    while index < len(lines):
        raw = lines[index]
        line = raw.rstrip()

        # A fence is checked before every other rule, and consumes its own
        # lines. Nothing inside it is Markdown: a "# " in a code sample is a
        # comment, and letting the heading rule see it would rewrite the code.
        if fence := FENCE_RE.match(line):
            close_list()
            marker, language = fence.group(1), fence.group(2).strip()
            body: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].rstrip().startswith(marker):
                body.append(lines[index])
                index += 1
            index += 1  # the closing fence

            node: dict[str, Any] = {"type": "codeBlock", "attrs": {"language": language or None}}
            code = "\n".join(body)
            if code:
                node["content"] = [{"type": "text", "text": code}]
            content.append(node)
            continue

        # Consecutive quoted lines are one blockquote, parsed recursively so a
        # quote may hold anything a document may hold.
        if quote := QUOTE_RE.match(line):
            close_list()
            quoted = [quote.group(1)]
            index += 1
            while index < len(lines) and (inner := QUOTE_RE.match(lines[index].rstrip())):
                quoted.append(inner.group(1))
                index += 1

            inner_doc = markdown_to_doc("\n".join(quoted))
            content.append({"type": "blockquote", "content": inner_doc.get("content", [])})
            continue

        # A table needs its delimiter row to be a table at all, so the next line
        # is inspected before committing. Without that check a paragraph
        # containing pipes would be swallowed as a one-row table.
        if (
            ROW_RE.match(line)
            and index + 1 < len(lines)
            and DELIMITER_RE.match(lines[index + 1].rstrip())
        ):
            close_list()
            aligns = _alignments(lines[index + 1].rstrip())
            headers = _split_row(line)
            rows = [
                {
                    "type": "tableRow",
                    "content": [
                        _cell(cell, True, aligns[i] if i < len(aligns) else None)
                        for i, cell in enumerate(headers)
                    ],
                }
            ]

            index += 2
            while index < len(lines) and ROW_RE.match(lines[index].rstrip()):
                cells = _split_row(lines[index].rstrip())
                # Padded rather than refused: a hand-written file is allowed to
                # be untidy, and a short row is obvious in intent.
                cells += [""] * (len(headers) - len(cells))
                rows.append(
                    {
                        "type": "tableRow",
                        "content": [
                            _cell(cell, False, aligns[i] if i < len(aligns) else None)
                            for i, cell in enumerate(cells[: len(headers)])
                        ],
                    }
                )
                index += 1

            content.append({"type": "table", "content": rows})
            continue

        # Before the bullet rule, which would otherwise never see it — "---" has
        # no space after the dash — but before paragraphs, which would.
        if RULE_RE.match(line):
            close_list()
            content.append({"type": "horizontalRule"})
            index += 1
            continue

        index += 1

        if heading := HEADING_RE.match(line):
            close_list()
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": len(heading.group(1))},
                    "content": _inline(heading.group(2)),
                }
            )
        # Before BULLET_RE, and that ordering is the whole correctness argument:
        # "- [ ] milk" matches a bullet too, whose text would be "[ ] milk".
        elif task := TASK_RE.match(line):
            if list_node is None or list_node["type"] != "taskList":
                close_list()
                list_node = {"type": "taskList", "content": []}
            list_node["content"].append(
                {
                    "type": "taskItem",
                    "attrs": {"checked": task.group(1).lower() == "x"},
                    "content": [_paragraph(task.group(2))],
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
            # A trailing backslash continues the paragraph on a new line, so the
            # run of continued lines is gathered into one node rather than
            # becoming a paragraph each.
            paragraph_lines = [line.removesuffix("\\")]
            while line.endswith("\\") and index < len(lines):
                line = lines[index].rstrip()
                index += 1
                paragraph_lines.append(line.removesuffix("\\"))

            content.append(_paragraph_from_lines(paragraph_lines))

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
_INLINE_ESCAPES = str.maketrans(
    {"\\": "\\\\", "*": "\\*", "`": "\\`", "~": "\\~", "[": "\\[", "]": "\\]"}
)

# A line beginning with one of these means something to the importer, so a
# paragraph that happens to start that way has its first character escaped.
#
# A single backtick is deliberately absent: it opens an inline code span, which
# is fine at the start of a line. Only a fence — three or more — has to be
# escaped, and that is handled separately.
_LINE_STARTERS = ("#", "-", ">")


def _escape_inline(text: str) -> str:
    return text.translate(_INLINE_ESCAPES)


def _escape_line_start(line: str) -> str:
    """Stop a paragraph from being re-read as a heading or a list item."""
    for starter in _LINE_STARTERS:
        if line.startswith(starter):
            return "\\" + line
    # Only a fence, not the inline span a single backtick opens.
    if line.startswith("```"):
        return "\\" + line
    # "1. " would come back as an ordered list, so the dot is escaped rather
    # than the digit — escaping a digit means nothing to Markdown.
    if NUMBERED_RE.match(line):
        number, _, rest = line.partition(".")
        return f"{number}\\.{rest}"
    return line


def _href_of(node: dict[str, Any]) -> str:
    marks = node.get("marks")
    for mark in marks if isinstance(marks, list) else []:
        if isinstance(mark, dict) and mark.get("type") == "link":
            attrs = mark.get("attrs")
            if isinstance(attrs, dict):
                return str(attrs.get("href") or "")
    return ""


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
        if not isinstance(node, dict):
            continue

        # Shift+Enter inside a paragraph. A trailing backslash is Markdown's
        # unambiguous line break; two trailing spaces are invisible and get
        # stripped by most editors on the way back in.
        if node.get("type") == "hardBreak":
            out.append("\\\n")
            continue

        if node.get("type") != "text":
            continue

        raw = str(node.get("text", ""))
        marks = _marks_of(node)

        # Code first, and it returns: its content is literal, so escaping it
        # would put backslashes into someone's code sample. Nothing may wrap it
        # either — `**a**` inside backticks is not bold.
        if "code" in marks:
            out.append(f"`{raw}`")
            continue

        text = _escape_inline(raw)

        # Innermost first, so a run carrying several marks nests rather than
        # interleaving. The order here is the contract the importer is written
        # against: reversing it would still produce valid Markdown and would
        # stop round-tripping.
        if "italic" in marks:
            text = f"*{text}*"
        if "strike" in marks:
            text = f"~~{text}~~"
        if "bold" in marks:
            text = f"**{text}**"
        # Markdown cannot express underline, and the editor offers it. Dropping
        # it would silently lose something the author deliberately applied.
        if "underline" in marks:
            text = f"<u>{text}</u>"

        # Outermost, and applied last rather than returning early — a link may
        # also be bold, and short-circuiting here dropped every other mark on it.
        if "link" in marks:
            href = _href_of(node)
            # An unsafe href never survives import, but a document could hold one
            # from before this rule existed, so it is checked on the way out too.
            if href and is_safe_url(href):
                text = f"[{text}]({href})"

        out.append(text)

    return "".join(out)


def _fence_for(code: str) -> str:
    """A fence longer than any run of backticks inside the code.

    Three backticks are the norm, but a sample that itself contains ``` would
    close the block early and spill the rest into the document.
    """
    longest = max((len(run) for run in re.findall(r"`+", code)), default=0)
    return "`" * max(3, longest + 1)


def _code_block_to_markdown(block: dict[str, Any]) -> str:
    children = block.get("content")
    code = "".join(
        str(child.get("text", ""))
        for child in (children if isinstance(children, list) else [])
        if isinstance(child, dict)
    )

    attrs = block.get("attrs")
    language = attrs.get("language") if isinstance(attrs, dict) else None
    fence = _fence_for(code)

    return f"{fence}{language or ''}\n{code}\n{fence}"


def _blockquote_to_markdown(block: dict[str, Any]) -> str:
    """Render the quoted blocks, then prefix every line.

    Recursive rather than paragraph-only, so a quote containing a list or a
    heading survives instead of being flattened into one line.
    """
    inner = doc_to_markdown({"type": "doc", "content": block.get("content", [])})
    if not inner:
        return ">"

    return "\n".join(f"> {line}".rstrip() for line in inner.split("\n"))


_ALIGN_DELIMITERS = {"left": ":---", "center": ":---:", "right": "---:", None: "---"}


def _cell_text(cell: Any) -> str:
    """A cell's content, flattened to inline text.

    GFM cells hold inline content only — a list inside a cell cannot be
    expressed — so the paragraphs are joined with a space rather than a newline,
    which would end the row. This is the one place this phase knowingly loses
    structure, and the spec says so.

    The pipe is escaped last: it is the cell delimiter, and one the author typed
    would otherwise split their content into two cells on the way back.
    """
    if not isinstance(cell, dict):
        return ""
    children = cell.get("content")
    text = " ".join(
        _inline_to_markdown(child.get("content"))
        for child in (children if isinstance(children, list) else [])
        if isinstance(child, dict)
    ).strip()

    return text.replace("|", "\\|").replace("\n", " ")


def _table_to_markdown(block: dict[str, Any]) -> str:
    rows = block.get("content")
    rows = [row for row in (rows if isinstance(rows, list) else []) if isinstance(row, dict)]
    if not rows:
        return ""

    def cells_of(row: dict[str, Any]) -> list[Any]:
        cells = row.get("content")
        return [c for c in (cells if isinstance(cells, list) else []) if isinstance(c, dict)]

    header = cells_of(rows[0])
    if not header:
        return ""

    def align_of(cell: dict[str, Any]) -> str | None:
        attrs = cell.get("attrs")
        return attrs.get("textAlign") if isinstance(attrs, dict) else None

    lines = [
        "| " + " | ".join(_cell_text(c) for c in header) + " |",
        # Not padded to the column's width: aligned cells make a prettier file
        # and a worse diff, because editing one cell rewrites the whole column.
        "|" + "|".join(_ALIGN_DELIMITERS[align_of(c)] for c in header) + "|",
    ]

    for row in rows[1:]:
        cells = cells_of(row)
        cells += [{}] * (len(header) - len(cells))
        lines.append("| " + " | ".join(_cell_text(c) for c in cells[: len(header)]) + " |")

    return "\n".join(lines)


def _is_checked(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    attrs = item.get("attrs")
    return bool(attrs.get("checked")) if isinstance(attrs, dict) else False


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

        elif kind == "blockquote":
            chunks.append(_blockquote_to_markdown(block))

        elif kind == "codeBlock":
            chunks.append(_code_block_to_markdown(block))

        elif kind == "horizontalRule":
            chunks.append("---")

        elif kind == "table":
            chunks.append(_table_to_markdown(block))

        elif kind == "taskList":
            items = block.get("content")
            items = items if isinstance(items, list) else []
            chunks.append(
                "\n".join(
                    "- [{}] {}".format(
                        "x" if _is_checked(item) else " ", _list_item_text(item)
                    )
                    for item in items
                )
            )

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


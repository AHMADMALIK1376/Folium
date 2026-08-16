from typing import Any


def empty_doc() -> dict[str, Any]:
    """Return a fresh empty TipTap document.

    A factory rather than a module-level constant: JSONB values are mutable, and
    a shared dict would let one document's edits leak into another's default.
    """
    # `attrs` because TipTap's TextAlign extension is configured for paragraphs,
    # and ProseMirror serialises an attribute even at its default — a paragraph
    # without it is not one the editor would produce. Documents stored before
    # this are unaffected: TipTap fills the default in on load.
    return {"type": "doc", "content": [{"type": "paragraph", "attrs": {"textAlign": None}}]}

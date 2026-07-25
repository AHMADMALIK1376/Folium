from typing import Any


def empty_doc() -> dict[str, Any]:
    """Return a fresh empty TipTap document.

    A factory rather than a module-level constant: JSONB values are mutable, and
    a shared dict would let one document's edits leak into another's default.
    """
    return {"type": "doc", "content": [{"type": "paragraph"}]}

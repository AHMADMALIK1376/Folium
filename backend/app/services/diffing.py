"""Word-level diffs between two versions of a document's text.

Needs no new data: every version already stores its full content, and
`doc_to_plain_text` already flattens a document to text. This is arithmetic over
things that exist.
"""

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

# Above this, a comparison is refused rather than attempted. SequenceMatcher is
# quadratic in the worst case, and a pair of large documents with little in
# common IS that worst case — an endpoint that can hang a worker is worse than
# one that declines. Roughly a 40-page document.
MAX_CHARS = 200_000

# Words and the whitespace between them, each as its own token. Whitespace is a
# token rather than a separator so that joining the segments back together
# reproduces the text exactly rather than approximately.
_TOKEN_RE = re.compile(r"\s+|\S+")


class DocumentTooLargeError(Exception):
    """The pair is too big to compare in bounded time."""


@dataclass
class Segment:
    op: str  # "equal" | "added" | "removed"
    text: str


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text or "")


def diff_text(before: str, after: str) -> list[Segment]:
    """Word-level segments turning `before` into `after`.

    Words rather than characters, because a character diff of a rewritten
    sentence is confetti; words rather than lines, because a line diff marks a
    whole paragraph as changed when one word moved, which is what makes prose
    diffs in git unpleasant to read.
    """
    if len(before) + len(after) > MAX_CHARS:
        raise DocumentTooLargeError

    old, new = tokenize(before), tokenize(after)

    # autojunk=False is load-bearing, not a default worth accepting. With it on,
    # SequenceMatcher treats any token appearing in more than 1% of a sequence
    # over 200 items as junk — in prose that is "the", "and", "of", every common
    # word — and the diff silently becomes wrong on exactly the long documents
    # where a diff is most needed. It fails plausibly, which is worse than
    # failing loudly.
    matcher = SequenceMatcher(a=old, b=new, autojunk=False)

    segments: list[Segment] = []

    def push(op: str, text: str) -> None:
        if not text:
            return
        # Runs of the same kind are merged, so the client renders one span per
        # change rather than one per word.
        if segments and segments[-1].op == op:
            segments[-1].text += text
        else:
            segments.append(Segment(op=op, text=text))

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            push("equal", "".join(old[i1:i2]))
        else:
            # A replacement is a removal followed by an addition, in that order,
            # so the reader sees what went before what arrived.
            if tag in ("replace", "delete"):
                push("removed", "".join(old[i1:i2]))
            if tag in ("replace", "insert"):
                push("added", "".join(new[j1:j2]))

    return segments


def count_changes(segments: list[Segment]) -> tuple[int, int]:
    """Words added and removed, for the summary line that answers the question
    most of the time."""
    added = sum(len(s.text.split()) for s in segments if s.op == "added")
    removed = sum(len(s.text.split()) for s in segments if s.op == "removed")

    return added, removed

"""Word-level diffs.

Pure functions, no database.
"""

import pytest

from app.services.diffing import (
    MAX_CHARS,
    DocumentTooLargeError,
    count_changes,
    diff_text,
    tokenize,
)


def rebuild(segments, side: str) -> str:
    keep = ("equal", "removed") if side == "before" else ("equal", "added")
    return "".join(s.text for s in segments if s.op in keep)


def test_identical_text_has_no_changes():
    segments = diff_text("the same words", "the same words")

    assert [s.op for s in segments] == ["equal"]
    assert count_changes(segments) == (0, 0)


def test_an_insertion_is_marked_added():
    segments = diff_text("one two", "one and two")

    assert any(s.op == "added" and "and" in s.text for s in segments)
    assert count_changes(segments) == (1, 0)


def test_a_deletion_is_marked_removed():
    segments = diff_text("one and two", "one two")

    assert any(s.op == "removed" and "and" in s.text for s in segments)
    assert count_changes(segments) == (0, 1)


def test_a_replacement_shows_the_old_before_the_new():
    """So the reader sees what went before what arrived."""
    segments = diff_text("the quick fox", "the slow fox")
    ops = [s.op for s in segments if s.op != "equal"]

    assert ops == ["removed", "added"]


@pytest.mark.parametrize(
    "before,after",
    [
        ("", "brand new text"),
        ("all of this goes", ""),
        ("keep this", "keep this and more"),
        ("a b c d e", "a x c y e"),
        ("punctuation, matters! it does?", "punctuation matters; it does"),
        ("line one\nline two\n\nline four", "line one\nline 2\n\nline four"),
        ("  leading and trailing  ", "  leading and  trailing  "),
    ],
)
def test_the_segments_rebuild_both_sides_exactly(before, after):
    """The property that makes the rest trustworthy. Whitespace is tokenised
    rather than treated as a separator precisely so this holds — otherwise the
    diff is approximate and nobody notices until a paragraph loses its breaks.
    """
    segments = diff_text(before, after)

    assert rebuild(segments, "before") == before
    assert rebuild(segments, "after") == after


def test_tokenizing_keeps_whitespace():
    assert "".join(tokenize("a  b\nc")) == "a  b\nc"


def test_runs_of_the_same_kind_are_merged():
    """One span per change, not one per word."""
    segments = diff_text("start end", "start one two three end")

    assert len([s for s in segments if s.op == "added"]) == 1


def test_autojunk_is_off_on_a_long_document():
    """The guard that matters most, and the one that fails plausibly.

    SequenceMatcher's autojunk heuristic treats any token appearing in more than
    1% of a sequence over 200 items as junk. In prose that is "the", "and",
    "of" — every common word — and with it enabled the diff silently becomes
    wrong on exactly the long documents where a diff is most needed.

    This builds a document long enough for the heuristic to engage, changes one
    word, and asserts the diff still finds that one word rather than reporting a
    wholesale rewrite.
    """
    before = " ".join(["the value of the work is the point"] * 60)
    after = before.replace("the point", "the purpose", 1)

    segments = diff_text(before, after)
    added, removed = count_changes(segments)

    assert (added, removed) == (1, 1), "autojunk is distorting the comparison"
    assert rebuild(segments, "before") == before
    assert rebuild(segments, "after") == after


def test_an_oversized_comparison_is_refused_rather_than_attempted():
    """SequenceMatcher is quadratic in the worst case, and an endpoint that can
    hang a worker is worse than one that declines."""
    huge = "word " * (MAX_CHARS // 2)

    with pytest.raises(DocumentTooLargeError):
        diff_text(huge, huge + "extra")


def test_a_comparison_just_under_the_cap_is_attempted():
    text = "x" * (MAX_CHARS // 2 - 10)

    assert diff_text(text, text) is not None


def test_counts_ignore_whitespace_only_segments():
    """Whitespace shifting around should not report words added."""
    segments = diff_text("one two", "one  two")
    added, removed = count_changes(segments)

    assert (added, removed) == (0, 0)

# Folium Phase 10 — See what changed

**Date:** 2026-08-17
**Status:** Approved, not yet implemented
**Scope:** A word-level diff between an earlier version and the document as it stands.

---

## 1. The gap

Version history has been able to **preview** a draft and **restore** it since Phase 3. It has never
been able to answer the question anyone actually has when they open it: *what changed?*

Previewing a 900-word document against another 900-word document and spotting the altered sentence by
eye is not a feature, it is a chore the software declined to do. Restoring without knowing what you
are about to lose is worse.

This is also the rare feature that needs **no new data**. Every version already stores its full
content, and `doc_to_plain_text` already flattens a document to text. The diff is arithmetic over
things that exist.

---

## 2. What it does

```
GET /api/v1/documents/{id}/versions/{version_id}/diff  ->  { segments: [...], added, removed }
```

A **word-level** diff between the chosen version and the document's current content, as a flat list
of `{ op: "equal" | "added" | "removed", text }`.

| Decision | Reason |
|---|---|
| Words, not characters | A character diff of a rewritten sentence is confetti. Words are the unit people edit in. |
| Words, not lines | A line diff marks a whole paragraph changed because one word moved — which is what `git diff` does to prose, and why prose diffs in git are unpleasant to read. |
| Plain text, not the node tree | Structure changes (a paragraph becoming a heading) are real but a second problem. Text is what people mean by "what changed". |
| Against the **current** document | The question is "what would restoring cost me", and the answer is relative to now. |
| Whitespace is a token, not a separator | So reassembling the segments reproduces the text exactly, rather than approximately. |

Follows **view** permission, like the rest of history: reading a diff discloses nothing the reader
could not already get by opening both versions.

---

## 3. The parts that will go wrong

- **`SequenceMatcher` is quadratic in the worst case.** A pair of large documents with little in
  common is exactly that worst case, and a diff endpoint that can hang the server is worse than no
  diff endpoint. Input is capped, and a document over the cap returns a truthful "too large to
  compare" rather than a timeout.
- **`autojunk` must be off.** `SequenceMatcher` heuristically treats tokens appearing in more than 1%
  of a large sequence as junk — in prose that is "the", "and", every common word — and the diff
  quietly becomes wrong on exactly the long documents where it matters most. This is the single
  most likely source of a plausible-looking bad answer here.
- **An unchanged document must say so**, not render 900 words of "equal" segments and leave the
  reader to conclude nothing happened.

---

## 4. The interface

Inside the existing history dialog, beside the preview: a **Changes** view showing the diff, with
additions and removals distinguished by more than colour — colour alone fails for the eight percent
of men with a colour vision deficiency, so removals are struck through and additions underlined.

A summary line first: *"12 words added, 4 removed"*. That is the answer to the question most of the
time, and the detail is for when it is not.

---

## 5. Testing

| Layer | Coverage |
|---|---|
| Backend unit | Insertions, deletions, replacements; reassembly reproduces both sides exactly; identical input yields no changes; whitespace and punctuation survive |
| **Backend guard** | `autojunk` is off — asserted on a document long enough for the heuristic to engage, because that is where it silently ruins the result |
| Backend API | A viewer may diff; a stranger gets 404; a version from another document is 404; oversized input is refused rather than hanging |
| Frontend unit | Additions and removals are distinguished without relying on colour; the summary counts; the no-changes state |
| End to end | Edit a document, open history, and see the added words marked |

---

## 6. Out of scope

- Diffing two arbitrary versions against each other, rather than a version against the current one.
- Structural diffing — a paragraph becoming a heading shows as unchanged text.
- Restoring part of a diff. Restore stays all-or-nothing.
- Diffing attachments, or the title.

---

## 7. Definition of done

- [ ] A diff shows which words were added and which removed, against the current document
- [ ] Reassembling the segments reproduces both documents exactly
- [ ] An unchanged document says so rather than listing everything
- [ ] `autojunk` is off, and a test proves it on a document long enough to trigger it
- [ ] An oversized comparison is refused truthfully, never hangs
- [ ] Additions and removals are distinguishable without colour
- [ ] Backend, Vitest and Playwright pass; Playwright twice in a row

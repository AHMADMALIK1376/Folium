# Folium Phase 7-i — Search

**Date:** 2026-08-16
**Status:** Approved, not yet implemented
**Scope:** Find a document by what is in it.

---

## 1. Context

The editor is capable now. Finding anything is not: the dashboard is a flat list of every document,
newest first, and there is no search at all. That is the gap every user reaches first, because
documents accumulate from day one while comments only matter once there is an argument about one.

It is also the missing half of a request already made — a sidebar over a flat list is a list in a
narrower column. Search is the content that makes navigation worth building.

---

## 2. Two approaches, and why the obvious one is wrong

Postgres can index JSONB directly:

```sql
jsonb_to_tsvector('english', content, '["string"]')
```

Zero maintenance, no extra column, and it cannot drift from the content because it is derived from it.
It was tested against a real document, and the index it produces is:

```
'doc':1 'grew':13 'head':3 'northern':16 'paragraph':10 'plan':6 'text':8,19
```

**`doc`, `head`, `paragraph`, `text`.** It extracts every string *value*, and TipTap stores its node
types as string values — so searching "paragraph" would match every document a person owns. In a
document editor those are plausible search terms, not exotic ones.

So the index is built from **`documents.content_text`**, which has existed since Phase 1, is already
maintained by `create_document`, `update_document` and version restore, and holds exactly the human
text because `doc_to_plain_text` walks to `type == "text"` nodes only. No new column, no backfill,
no app-side work — the groundwork was laid three phases before it was needed.

---

## 3. What search does

```
GET /api/v1/documents/search?q=northern+region  ->  { results: [...], query: "..." }
```

| Rule | Reason |
|---|---|
| Title **and** body are searched | "the one about revenue" is a body memory as often as a title one. |
| A title match outranks a body match | If the words are in the title, that is the document. |
| Only documents the caller can see | Owned, or shared with them — the same rule the dashboard uses, resolved the same way. |
| Trash is excluded | A deleted document is not an answer. Restoring it is a separate decision. |
| Results carry a snippet | A list of titles does not say *why* something matched. |
| An empty or whitespace query returns nothing, not everything | A blank search box is not a request for every document. |

**`websearch_to_tsquery`, not `plainto_tsquery`.** It accepts what people actually type — quoted
phrases, `or`, a leading `-` to exclude — and, critically, **it does not raise on malformed input**.
`to_tsquery` throws a syntax error on a stray operator, which would turn a half-typed query into a 500.

### Ranking, and the honest limit

`ts_rank` over the combined vector, with the title weighted above the body. This is lexical search:
it matches words, not meaning. Searching "money" will not find "revenue". Saying so here is cheaper
than someone concluding search is broken.

---

## 4. The interface

A search box above the dashboard list. Typing filters; clearing restores the normal view.

| Situation | Behaviour |
|---|---|
| Fewer than 2 characters | Nothing runs. One letter matches everything and costs a round trip. |
| Typing | Debounced, like autosave — a request per keystroke is a request per keystroke. |
| No matches | Says so, with the query quoted back, and offers to clear. |
| Failure | The shared `ApiErrorMessage`; the list below is left alone. |
| A result | Shows the title, a snippet, and whether it is owned or shared. |

---

## 5. Testing

| Layer | Coverage |
|---|---|
| Backend unit | The query builder ignores blanks; a snippet is bounded |
| Backend API | Finds by title and by body; ranks title above body; excludes trash; excludes other people's documents; **a query of punctuation does not 500**; unauthenticated is 401 |
| Frontend unit | Debounces; ignores one character; renders results and the empty state; a failure leaves the list |
| End to end | Create a document with a distinctive word, search for it, open it from the results |

The security test is the one worth naming: search takes raw user input into a query language, and
`to_tsquery` raising on `"` or `&` is exactly the shape of a 500 nobody notices until a user types an
apostrophe.

---

## 6. Out of scope

- Folders, tags, favourites, and the sidebar itself — Phase 7-ii, which this makes worth building.
- Semantic or vector search.
- Searching version history, attachment contents, or comments.
- Highlighting matched terms inside the editor.

---

## 7. Definition of done

- [ ] A document is found by a word in its title or its body
- [ ] A title match ranks above a body match
- [ ] Trash and other people's documents never appear
- [ ] A malformed query returns results or nothing — never a 500
- [ ] A blank query returns nothing rather than everything
- [ ] Results show a snippet, not just a title
- [ ] Backend, Vitest, and Playwright pass; Playwright twice in a row

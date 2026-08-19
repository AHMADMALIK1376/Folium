# Folium Phase 12 — Inline images

**Date:** 2026-08-17
**Status:** Approved, not yet implemented
**Scope:** Put an image in a document, not just beside it.

---

## 1. The blocker, and the decision

Attachments have existed since 5-ii, but only as a list beside the document. Inline images were
blocked on a genuine design question rather than effort, recorded in 6-ii:

> Attachments live in a **private** bucket reached through signed URLs that expire in five minutes.
> A document containing `![](signed-url)` would render for five minutes and then show broken images
> **forever** — including in every version-history snapshot that captured it.

Two ways out. **The redirect wins, and not narrowly.**

| | Public bucket | Redirect endpoint |
|---|---|---|
| URL in the document | Permanent | Permanent |
| Who can read the file | **Anyone who ever sees the URL, forever** | Whoever can view the document, now |
| Revoking a share | Does not revoke the image | Revokes the image |
| Bytes through the backend | No | No — it 302s, the browser fetches from Storage |
| Cost | — | One redirect per image render |

A public bucket would silently undo the access model attachments were built on: a collaborator you
remove keeps every image they ever loaded, and so does anyone they sent a link to. That is not a
trade, it is a regression with a performance benefit.

```
GET /api/v1/documents/{id}/attachments/{aid}/raw
  -> 302 to a freshly signed URL, having checked view permission
```

---

## 2. What is stored

The image node's `src` is the **raw endpoint**, not a signed URL. That is the whole point: it is
stable, so a document written today still renders next year, and a version-history snapshot from six
months ago still renders too.

Markdown *can* express images, so this round-trips: `![alt](src)`.

**An exported `.md` carries Folium URLs that require signing in.** Someone opening that file
elsewhere sees broken images. That is stated here and in the README rather than discovered — the
alternative is embedding base64 in the Markdown, which turns a 2MB photo into 2.7MB of text in a
file meant to be readable.

---

## 3. Security

The same allow-list links use, for the same reason: a `src` is something the *reader's* browser will
fetch. `data:` URLs are refused — an SVG data URL is script in an image's clothing — as is anything
not `http`, `https`, or a relative path.

Alt text is required-ish: the upload flow offers it and defaults to the filename. An image with no
alt text is invisible to a screen reader, and a document editor that makes that the easy path is
making its users' documents worse.

---

## 4. Testing

| Layer | Coverage |
|---|---|
| Backend | The redirect 302s to a signed URL; a viewer may; a stranger gets 404; an attachment from another document is 404 |
| Backend converter | `![alt](src)` both directions; alt text survives; a `data:` src is refused on import |
| Backend contract | `image` joins `editor-schema.json` and the parity test proves it round-trips |
| Frontend | Inserting an image uploads it and puts the raw URL in the document; a non-image attachment is refused |
| End to end | Insert an image, reload, and see it still render — the case the signed-URL approach would have failed |

---

## 5. Out of scope

- Resizing, captions, alignment of images.
- Pasting an image from the clipboard.
- External images by URL — every image is an attachment of that document, so permission has one
  answer rather than two.

---

## 6. Definition of done

- [ ] An image can be inserted, and still renders after a reload and a day later
- [ ] The redirect follows view permission; a stranger gets 404
- [ ] `data:` and other schemes are refused
- [ ] Alt text defaults to the filename rather than being empty
- [ ] `![alt](src)` round-trips, and `image` is in the schema contract
- [ ] Backend, Vitest and Playwright pass; Playwright twice in a row

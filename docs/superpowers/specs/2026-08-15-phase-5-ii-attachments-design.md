# Folium Phase 5-ii — Attachments

**Date:** 2026-08-15
**Status:** Approved, not yet implemented
**Scope:** Attach files to a document, stored in Supabase Storage.

---

## 1. Context

Phase 5-i shipped export, which was the half of Phase 5 that could be built without new
infrastructure. This is the other half, and the last item on the roadmap.

The `attachments` table has existed since Phase 1 — `document_id`, `filename`, `mime_type`,
`size_bytes`, `storage_path`, `created_at` — and has never had a row in it. The foundation design is
explicit about why the column is `storage_path` and not a `BLOB`: v1 kept file bytes in the database,
which bloats every backup and every query plan for data that is not queried. That decision is already
made; this phase honours it.

---

## 2. Where the bytes live, and who is allowed to move them

### Supabase Storage, reached with a service-role key

A private `attachments` bucket. The backend holds a **service-role key** and is the only thing that
talks to Storage.

This is the fork worth stating plainly, because the alternative is genuinely tempting: the browser
could upload straight to Storage with the user's own session token, and RLS policies on
`storage.objects` could decide who reads what. No new secret in the deployment.

It is rejected because **it would put the permission rules in two places.** Folium's access model is
not "your own files" — it is ownership plus a share table with view/comment/edit levels, resolved by
`resolve_permission` in `app/services/permissions.py`. Expressing that in SQL policies means a second
implementation of the same rules, in a different language, that must be kept in step by hand forever.
The first time they disagree, someone reads a document they were removed from. One source of truth is
worth one secret.

Consequently `config.py` gains `SUPABASE_SERVICE_ROLE_KEY`, and the comment there that says this
service deliberately holds no admin credential stops being true and must be rewritten rather than
left to mislead.

### Blank key means the feature is off

Exactly as `Y_SWEET_CONNECTION_STRING` already works. With no key configured, the attachment routes
return **503**, the UI does not offer the control, and every other test still passes. CI holds no
Supabase credentials and must stay able to run the suite; a feature that cannot be disabled cannot be
tested by anyone who has not signed up for the vendor.

### Uploads go through the backend; downloads do not

**Upload** is a normal multipart request to FastAPI, which checks permission, validates the file, and
forwards the bytes to Storage. Signed upload URLs would save the proxy hop, but they force a
two-phase dance — mint a URL, client uploads, client confirms — whose failure mode is a database row
describing a file that was never stored. With a 10MB cap, proxying is the simpler and more honest
trade, and it matches `import_document`, which has proxied uploads since 2C-iii.

**Download** is the reverse, and here the proxy is not worth it. The backend checks permission and
returns a **short-lived signed URL**; the browser fetches the bytes from Storage directly. Streaming
file bytes back out through a free-tier Python host is the one part of this that would actually hurt.

---

## 3. What may be attached

| Rule | Value | Why |
|---|---|---|
| Maximum size | 10MB | Ten times the import limit, which is text. Big enough for a photo or a slide, small enough to proxy. |
| Maximum per document | 20 | A bound that exists so there is one, rather than discovering the absence of one. |
| Allowed kinds | PNG, JPEG, GIF, WebP, PDF, plain text, Markdown, CSV | What a document editor is actually for. |

**The content type is derived from the extension, never taken from the request.** A client-supplied
`Content-Type` is a claim by the uploader, and storing it unchecked means a file can be served back
under a type it is not.

**SVG is deliberately excluded** despite being an image. SVG is a document format that can carry
script, and it is served from a signed URL the user is invited to open. The other formats cannot do
that.

**The storage path contains nothing the user typed**: `{document_id}/{attachment_id}{ext}`. The
original filename is kept in the database for display and for the download. A path built from user
input is how directory traversal happens, and there is no reason to accept the risk when a UUID does
the job.

---

## 4. The API

```
POST   /api/v1/documents/{id}/attachments             multipart, edit    -> 201 AttachmentOut
GET    /api/v1/documents/{id}/attachments             view              -> [AttachmentOut]
GET    /api/v1/documents/{id}/attachments/{aid}/url   view              -> { url, expires_in }
DELETE /api/v1/documents/{id}/attachments/{aid}       edit              -> 204
```

Reading follows **view**, changing follows **edit** — the same split as version history, where anyone
who can read may browse and only an editor may restore.

Every failure of access is **404, never 403**, including an attachment id that belongs to another
document. `PermissionDeniedError` exists in `app/core/exceptions.py` and its docstring forbids using
it for documents precisely because a 403 confirms the resource exists. Attachments hang off documents
and inherit that rule.

---

## 5. Deleting

Removing an attachment removes its object and then its row.

Deleting a *document* removes neither, and that is not an oversight. **Folium has no permanent
delete** — `DELETE /documents/{id}` is a soft delete into a trash folder that exists to be undone, so
a document's files must outlive it. A restore that returns a document without its attachments would
be a worse bug than bytes sitting in a bucket.

There is therefore no "clean up this document's objects" function in the service, because there is no
moment at which it should run, and a function with no caller is a claim the code does not keep. The
one place rows genuinely disappear is `scripts/clean_test_data.py`, which hard-deletes test accounts
and lets `ON DELETE CASCADE` take their documents; cascade removes rows and knows nothing about
Storage, so that script removes the objects itself — best effort, never fatal, since a bucket it
cannot reach must not stop the database cleanup it exists to do.

When a permanent delete is added, it owes Storage the same courtesy.

---

## 6. The interface

An **Attachments** section below the editor: a file input, a list of what is attached with size and
date, a download control on each, and a remove control for editors. It is not a dialog — attachments
are part of the document rather than an action performed on it, and a dialog would hide the one thing
whose whole purpose is to be visible.

| Situation | Behaviour |
|---|---|
| Viewer or commenter | Sees the list and can download. No upload control, no remove. |
| Upload fails | The shared `ApiErrorMessage` treatment, list unchanged. |
| File too large or wrong type | Rejected in the browser before the upload starts, and again by the backend. |
| No key configured | The section is absent entirely, not an empty state or an error. |
| Nothing attached yet | A plain line saying so, with the upload control for editors. |

---

## 7. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend unit | pytest | Path building; extension-to-type mapping; the size and count limits; a blank key disabling the feature |
| Backend API | pytest | Upload/list/url/delete against a **fake storage client**, so the suite needs no bucket and no key; a viewer may list and get a URL but not upload or delete; a stranger gets 404; an attachment id from another document is 404 |
| Frontend unit | Vitest | The list renders; a viewer sees no upload or remove control; a failed upload reports and leaves the list intact |
| End to end | Playwright | Upload a file, see it listed, download it and assert its contents, delete it — skipped when no key is configured, exactly as the collaboration spec skips |

The storage boundary is one module with a narrow interface, so tests replace exactly it — the same
shape as `app/services/collab.py`, where `_mint` exists as a seam for that reason.

---

## 8. Out of scope

- Inline images in the document body. Attachments are a list beside the document, not editor nodes;
  embedding means TipTap schema changes and a round trip through import/export, which is its own phase.
- Thumbnails, previews, or any transformation.
- Versioning attachments, or restoring them with a document version.
- Virus scanning. Worth saying rather than implying: this is a portfolio project on a free tier, and
  the mitigation is the allow-list and the fact that files are served from a signed URL on a
  different origin.
- Quota per user or per account.

---

## 9. Definition of done

- [ ] A file can be attached to a document and appears in the list
- [ ] It can be downloaded, and the bytes match what was uploaded
- [ ] An editor can remove it; a viewer can do neither
- [ ] A stranger gets 404, and so does an attachment id from another document
- [ ] Oversized files, disallowed types, and the per-document cap are refused by the backend
- [ ] The content type comes from the extension, not from the request
- [ ] With no service-role key the feature is absent and the whole suite still passes
- [ ] Permanently deleting a document removes its objects, and a Storage failure does not block it
- [ ] Backend, Vitest, and Playwright pass; Playwright twice in a row

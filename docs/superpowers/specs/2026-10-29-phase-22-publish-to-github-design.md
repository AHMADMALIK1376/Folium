# Folium Phase 22 — Publish to GitHub

**Date:** 2026-10-29
**Status:** Proposed
**Scope:** Publish a document to a GitHub repository as Markdown; a features endpoint; a data notice.

---

## 1. Why

The Curavine team writes design documents in Folium (comments, sharing, history) and keeps one
source of truth in a private GitHub repo that every member's Claude Project and Claude Code read.
Folium stores TipTap JSON in PostgreSQL, which Claude cannot read. `doc_to_markdown` already
produces Markdown, but only as a manual download.

Two operational gaps ride along: nobody is told that patient data must not be stored here, and
optional features (y-sweet, Storage) fall back silently, so the team cannot tell what is on.

## 2. Part 1 — Publish

### 2.1 Shape

One server-side GitHub identity (a fine-grained token, Contents read/write on one repo). Users never
see or supply a token. Folium is the only writer it knows about; everything else is detected as a
conflict.

| Endpoint | Who | Purpose |
|---|---|---|
| `GET  /documents/{id}/publish` | anyone who can view | Status: configured, saved path, suggested path, last publication, commit URL |
| `POST /documents/{id}/publish` `{path, overwrite}` | owner, edit | Convert, commit, record |
| `GET  /documents/{id}/publications` | anyone who can view | History |
| `GET  /features` | any signed-in user | Booleans only (see Part 2) |

Not configured → publish routes answer **503** with a plain message. The UI hides the button using
`/features`, so a 503 is only reached by a stale page.

### 2.2 Permissions

`get_document` runs first, so a stranger still gets the usual 404. Only then is `can_edit` checked,
and a viewer or commenter gets **403**. That does not breach the 404-not-403 rule: that rule exists
so existence is not leaked, and anyone reaching the check can already open the document.

### 2.3 The publish algorithm

1. Load document and permission; 404 / 403 / 503 as above.
2. Validate the path (§2.4). Prefix `GITHUB_BASE_PATH` if set — the user sees and types the path
   *inside* the base, so the base is not editable by them.
3. `GET contents/{path}?ref=branch` → remote blob sha, or none if 404.
4. Decide:
   - remote exists, `last_published_blob_sha` is null → **409** (a file is already there that we did
     not write — including a different document's file at the same path);
   - remote exists and its sha ≠ `last_published_blob_sha` → **409** unless `overwrite`;
   - the *path changed* since last publish → the stored sha belongs to the old file, so the stored
     sha is treated as null for the comparison; if the new path is empty it is a plain create.
5. `PUT contents/{path}` with base64 content, `branch`, message
   `Publish: <title> (by <user>)`, and `sha` = the **remote** sha when updating (that is what GitHub
   requires; the comparison in step 4 is what makes it safe). GitHub itself rejects a PUT whose sha
   went stale in the meantime (409/422) — mapped to the same conflict response, closing the race
   between steps 3 and 5.
6. Record: update the four document columns and insert a `publications` row, in one transaction.
7. Return `{path, commit_sha, commit_url, blob_sha, published_at, published_by}`.

Conflict body: `{"code": "remote_changed", "detail": "This file was changed in GitHub since the last publish."}`
so the dialog can offer Cancel / Overwrite without parsing prose.

### 2.4 Paths

Pre-filled from `safe_filename(title)` (reused, not duplicated) under `docs/`. Accepted: relative,
`/`-separated, each segment non-empty, no `.` / `..` / `.git` segment, no backslash or control
characters, no leading `/`, length ≤ 240, must end in `.md`. Unicode is allowed — `safe_filename`
keeps Urdu letters and GitHub stores them — but each segment is percent-encoded when building the
API URL. Anything else is 422 from a Pydantic validator.

### 2.5 The file

```
---
folium_document_id: "…"
title: "…"
published_at: "2026-10-29T10:15:00Z"
published_by: "Name <email>"
folium_version_id: "…"        # latest document_versions row; key omitted if none
---

<doc_to_markdown(content)>
```

Scalars are written with `json.dumps(..., ensure_ascii=False)`: a JSON string is a valid YAML
double-quoted scalar, which makes colons, quotes, newlines and Urdu in a title safe without a YAML
dependency.

A published document is **a snapshot, not a mirror**: edits after publishing are not in GitHub until
someone publishes again. The dialog says so.

### 2.6 Configuration and secrets

`GITHUB_TOKEN`, `GITHUB_REPO` (`owner/name`, validated), `GITHUB_BRANCH` (default `main`),
`GITHUB_BASE_PATH` (optional, normalised). Enabled only when **token and repo are both set and the
repo parses**; a malformed `GITHUB_REPO` fails at startup rather than at first publish. Backend only:
no `NEXT_PUBLIC_` counterpart, never in a response, and never in a log line — errors from GitHub are
re-expressed in our own words, and the raw upstream body is never forwarded. The token is held as a
`SecretStr`, so an accidental `repr(settings)` redacts it.

### 2.7 Errors

All GitHub calls use one `httpx.AsyncClient` with a 10 s total timeout.

| GitHub / network | We answer |
|---|---|
| timeout, connect error | 504 "GitHub did not respond in time" |
| 401 | 502 "Folium's GitHub token was rejected — ask an administrator" |
| 403 (rate limit / scope) | 502, same family, distinct wording |
| 404 on repo/branch | 502 "The repository or branch was not found" (a 404 on the *file* is normal) |
| 409 / 422 on PUT | 409 remote_changed |
| anything else | 502 generic |

502/504 rather than 401/404 because from the caller's view *Folium* is the gateway that failed;
passing 401 through would make the frontend think the user's session had expired.

### 2.8 Data model

`documents` gains `github_path`, `last_published_blob_sha`, `last_published_at`,
`last_published_by` (FK users, SET NULL). New `publications(id, document_id CASCADE, user_id SET
NULL, path, commit_sha, blob_sha, published_at)` indexed on `(document_id, published_at)`. One
migration, after `a4c81f92e703`.

### 2.9 Frontend

`PublishDialog` beside Export, shown when `features.github_publish` **and** permission is owner/edit.
Path field (pre-filled, editable), the existing `lossyWarning`, the snapshot note, last-published
line. Conflict → inline message with Cancel / Overwrite. Success → commit link. The document header
shows "Last published <time> by <user>" to everyone who can view.

### 2.10 Deliberately not in this phase

- **Publish a whole folder.** Marked optional and "only if simple". It is not: it needs a path
  scheme per document, partial-failure reporting and, to be honest, one commit per file or the Git
  Data API. Recommend a follow-up.
- Pull from GitHub, webhooks, PR-based publishing.

### 2.11 Known limitation

GitHub is committed before the database row. If the database write fails after a successful commit,
the next publish sees a sha mismatch and offers Overwrite — safe, merely noisy. Logged with the
commit sha so it can be reconciled.

## 3. Part 2 — `/features`

`GET /api/v1/features` → `{collaboration, attachments, github_publish}`, authenticated, booleans
only. Frontend fetches it where needed (editor, document list) and shows: "Live editing is off —
edits by two people at the same time can overwrite each other" when collaboration is off; the
attachments panel is replaced by an explanation when storage is off (it is already hidden via
`attachments_enabled`; this adds the reason).

## 4. Part 3 — Data notice

Text: "For design documents only. Do not store patient or personal health data in Folium."
Shown on sign-up (always, not dismissible) and as a collapsible banner in the app shell; collapsed
state in `localStorage` (try/catch, renders correctly without it). Also in README.

## 5. Testing

Backend: GitHub mocked with `httpx.MockTransport` through a single client factory that tests
override — no network. Frontend: vitest with mocked API module. Cases are listed in the plan.

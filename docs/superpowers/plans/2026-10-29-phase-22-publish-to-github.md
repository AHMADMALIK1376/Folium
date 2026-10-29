# Folium Phase 22 — Publish to GitHub

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Publish a document to a private GitHub repo as Markdown; report which optional features are
configured; tell users not to store patient data.

**Spec:** `docs/superpowers/specs/2026-10-29-phase-22-publish-to-github-design.md`
**Branch:** `feature/publish-to-github` (not pushed, not merged without approval)

## Global Constraints

- The GitHub token never leaves the backend: no `NEXT_PUBLIC_`, no response field, no log line.
- No real network in tests; GitHub is a `httpx.MockTransport`.
- Full backend (pytest) and frontend (vitest, tsc, lint) suites run after each part; record baselines first.
- Do not touch unrelated features. Do not commit `.env` or any secret.

---

## Part 1 — Publish

### Task 1: Baselines
- [ ] Run backend pytest, ruff, vitest, tsc; note the counts.

### Task 2: Config
- [ ] `config.py`: `github_token: SecretStr`, `github_repo`, `github_branch="main"`, `github_base_path`;
      validators (repo is `owner/name`, base path normalised and safe); `github_publish_enabled`.
- [ ] `test_config.py` cases: disabled by default, enabled with both, bad repo rejected, token redacted in `repr`.
- [ ] `.env.example`, `DEPLOY.md` variables.

### Task 3: Schema
- [ ] Models: columns on `Document`, new `Publication`; export in `models/__init__.py`.
- [ ] Migration `…_add_publishing.py` (down_revision `a4c81f92e703`); upgrade/downgrade verified on the dev DB.

### Task 4: Service (`services/publishing.py`)
- [ ] `validate_path`, `suggested_path`, `build_front_matter`, `render_file` — pure, tested first
      (Urdu title, quotes/colons/newlines in title, `..`, absolute, backslash, no `.md`, base path join).
- [ ] `GitHubClient` (httpx, 10 s timeout, injectable via `get_github_client`): `get_file_sha`, `put_file`,
      error mapping per spec §2.7.
- [ ] `publish_document` implementing §2.3; `status_for`, `list_publications`.

### Task 5: Routes (`api/v1/publish.py`, `features.py`; register in `router.py`)
- [ ] Schemas in `schemas/publish.py`. 503 / 403 / 404 / 409 / 422 mapping.
- [ ] Tests (`test_publish_api.py`): creates file; second publish updates with sha; 409 on remote change;
      overwrite works; 409 when file exists but was never ours; path change; viewer and commenter 403;
      stranger 404; not configured 503; token absent from every response and from `caplog`;
      front-matter correct; Urdu title → valid path; GitHub 401/404/422/timeout mapped; history lists publishes.

### Task 6: Frontend
- [ ] `lib/api/documents.ts`: `getPublishStatus`, `publishDocument`, `getPublications`; types.
- [ ] `lib/api/features.ts` (`getFeatures`) — shared with Part 2.
- [ ] `PublishDialog.tsx`; wire into `DocumentEditor.tsx` beside `ExportDialog`; "Last published" line.
- [ ] vitest: hidden for viewer/commenter; hidden when not configured; conflict → Cancel/Overwrite;
      success shows commit link; path prefilled and editable.

### Task 7: Gate
- [ ] Full suites green; commit Part 1.

## Part 2 — Features

- [ ] `GET /features` already exists from Task 5; add collaboration + attachments flags and tests
      (booleans only, no secrets, 401 unauthenticated).
- [ ] Editor: collaboration-off note; attachments-off explanation. vitest for both.
- [ ] Full suites green; commit.

## Part 3 — Data notice

- [ ] `DataNotice` component: fixed on sign-up; collapsible in the app shell (`localStorage` in try/catch).
- [ ] vitest: renders text; collapse persists; works when storage throws.
- [ ] README notice.
- [ ] Full suites green; commit.

## Docs

- [ ] README: features section, progress row for Phase 22, env vars.
- [ ] ARCHITECTURE: publishing flow, data model additions.
- [ ] DEPLOY: GitHub token creation steps (fine-grained, one repo, Contents R/W), env vars.
- [ ] Final summary.

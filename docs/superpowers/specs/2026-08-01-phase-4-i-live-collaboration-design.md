# Folium Phase 4-i — Live collaboration

**Date:** 2026-08-01
**Status:** Approved, not yet implemented
**Scope:** Two people editing one document at once, with cursors, over a managed Yjs backend — and Postgres still the record of truth.

---

## 1. Context

Everything else in the roadmap is built. What remains is the problem the whole v2 rebuild was aimed at:
editing is last-write-wins, and since sharing shipped, any two real users can silently overwrite each
other. Phase 3 made that recoverable; this phase makes it stop happening.

| Phase | Deliverable | Status |
|---|---|---|
| 3 | Version history with restore | Done |
| **4-i** | **This spec.** Live sync, presence, and cursors, persisted back through FastAPI. | This phase |
| 4-ii | Reconnection, offline behaviour, and server-side reconciliation | Next |
| 5 | Attachments UI, export to PDF/Markdown | After |

---

## 2. The transport: y-sweet

A managed Yjs host, authorised by FastAPI. Among that category, **[y-sweet](https://github.com/jamsocket/y-sweet)**
is chosen for one decisive reason and several supporting ones.

**The decisive one: it has a Python SDK.** `y-sweet-sdk` (0.9.1, requires Python 3.12+, which this
backend already does) lets FastAPI mint client tokens itself:

```python
DocumentManager(connection_string).get_or_create_doc_and_token(doc_id)
# -> {"url": ..., "docId": ..., "token": ...}
```

The obvious alternative documents only a Node SDK for issuing tokens, which would have meant either an
undocumented REST call or a Next.js route handler holding the vendor secret — reintroducing exactly
the server-side-in-Next arrangement that Phase 2C-iii deleted. With y-sweet, the endpoint that checks
`can_view` and the endpoint that mints the token are the same function in the same service. Permission
logic stays in one place, which has been this project's rule since Phase 1.

Supporting reasons: it is MIT-licensed and self-hostable, so the vendor is replaceable rather than
load-bearing — the foundation spec's principle that *losing the vendor must never mean losing
documents*. It persists to S3-compatible storage. And it runs locally with `npx y-sweet serve`, which
means **this phase costs nothing to build, test, or run locally**; a Jamsocket account is needed only
when it is deployed. The $0/month conversation moves to deploy time rather than now.

### Collaboration is optional, and off by default

If `Y_SWEET_CONNECTION_STRING` is unset, the token endpoint reports collaboration unavailable and the
editor behaves exactly as it does today: local editing with autosave. Nothing regresses for a
deployment that has not configured it, CI needs no vendor, and the feature can be switched off if it
misbehaves without shipping a revert.

---

## 3. Authorising a room

```
POST /api/v1/documents/{id}/collab  ->  { url, doc_id, token, permission, enabled }
```

The handler calls the same `get_document` every other document route calls, so a caller who may not
see the document gets the same 404 as everywhere else, and only then asks y-sweet for a token.

| Situation | Response |
|---|---|
| Not configured | `200` with `enabled: false`. Not an error — the app works without it, and a 500 would make an unconfigured deployment look broken. |
| No access to the document | `404`, indistinguishable from "does not exist", as everywhere else. |
| y-sweet unreachable | `503`, distinct from `401`, matching the distinction Phase 2A built. |

The room id is derived from the document id rather than accepted from the client. A client that could
name its own room could join a room for a document it cannot read.

### Read-only users, honestly

The client token API exposes no documented read-only level, so a `view` collaborator's token is the
same as an editor's. Three things follow, and the third is the one that matters:

1. The editor mounts non-editable for them, as it already does.
2. They are not offered a toolbar, and the client does not write to the shared document.
3. **The durable boundary is unchanged:** content reaches Postgres only through `PATCH /documents/{id}`,
   which enforces `can_edit` and is already tested. A viewer who defeated the client could disturb a
   live session, but could not persist anything.

That is a real limitation, not a hidden one. Should y-sweet gain per-token authorization, the token
endpoint is the single place that changes. Until then it is recorded here and in the README.

---

## 4. The editor

### What changes

TipTap gains the `Collaboration` extension bound to the Y.Doc from y-sweet's provider, and
`CollaborationCursor` for presence. Two consequences are not optional:

- **StarterKit's history must be disabled.** `Collaboration` supplies its own undo manager, and
  running both means undo skips other people's changes or reverts them. This is the single most common
  way a TipTap collaboration integration goes subtly wrong.
- **`content` is no longer seeded from props when collaboration is on.** The Y.Doc is the source of
  truth for the live session; seeding the editor as well would insert the document a second time.

### Seeding an empty room, once

A room that y-sweet has never seen is empty, while Postgres holds the document. Somebody must put one
into the other, and if every client does it, the document appears two or three times.

The rule: **seed only when the shared fragment is empty, and only from the client that observes it
empty after the provider reports it has synced.** Before sync, every client's Y.Doc looks empty, which
is precisely the trap. This is the highest-risk mechanic in the phase and it gets a dedicated test.

### Presence

Each connected editor contributes a name and a colour to awareness. The colour is derived
deterministically from the user id, so the same person is the same colour for everyone and across
reloads — a random colour per session makes two people's cursors swap colours on refresh, which reads
as a bug.

Someone with no display name shows as their email's local part; never as a blank caret.

---

## 5. Persistence, and why Postgres still wins

y-sweet holds the live document and persists its own copy, but the record of truth stays in Postgres —
the governing principle from the foundation spec.

For this phase, that is done the way it already works: the client that made a change PATCHes the
merged TipTap JSON through the existing autosave, on the existing debounce. Nothing about the API,
version history, or the dashboard changes.

Two details make that correct rather than merely convenient:

- **Only locally-originated changes schedule a save.** Yjs fires an update for remote changes too, so
  without filtering by transaction origin, every client would PATCH every keystroke everyone typed —
  multiplying writes by the number of people in the room.
- **Version history keeps working, and gets better.** The Phase 3 rule that a different author always
  earns a snapshot now fires naturally as collaborators take turns.

Reconciling Postgres *from* y-sweet on the server — reading the merged state with `pycrdt` and writing
it back without a browser — is **4-ii**. It is the safety net for "everyone closed their laptop at
once", and it needs a Yjs-XML-to-TipTap-JSON converter that deserves its own phase rather than being
appended to this one.

---

## 6. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend | pytest | The token endpoint checks permission before minting; 404 for a stranger; `enabled: false` when unconfigured; 503 when y-sweet is unreachable; the room id derives from the document, never from the request |
| Frontend unit | Vitest | Collaboration stays off when the endpoint reports it unavailable; a read-only user never writes; the colour for a user id is stable |
| End to end | Playwright | **Two browsers, one document**: both type, and each sees the other's text and caret without reloading — then both close, and a fresh load shows the merged result from Postgres |

The two-browser Playwright test is the phase. Every unit test here can pass while real collaboration
is broken, because the failure modes are timing, sync, and duplication — none of which appear with a
mocked provider.

CI does not run it: it needs a y-sweet server as well as Supabase credentials. It runs locally against
`npx y-sweet serve`, which is also how the feature is developed.

---

## 7. Out of scope

- Server-side reconciliation from y-sweet into Postgres, offline editing, and reconnection UX — 4-ii.
- Comments and suggestions.
- A presence list beyond cursors — no avatar stack, no "3 people viewing".
- Per-token read-only enforcement, until the vendor supports it.
- Deploying y-sweet. Local development uses `npx y-sweet serve`; choosing between Jamsocket and
  self-hosting is a deployment decision, made when this is deployed.
- Replacing the client-driven persistence path, which stays exactly as Phase 2C-ii built it.

---

## 8. Definition of done

- [ ] Two browsers editing one document see each other's text live, without reloading
- [ ] Each sees the other's cursor, labelled, in a colour stable across reloads
- [ ] A document opened for the first time appears once, not twice — the seeding rule holds
- [ ] Undo undoes your own change, not someone else's
- [ ] A viewer sees live changes and contributes nothing
- [ ] With `Y_SWEET_CONNECTION_STRING` unset, the editor works exactly as it did in Phase 3
- [ ] The room id derives from the document id; a client cannot name its own room
- [ ] A caller who cannot see the document gets 404 from the token endpoint
- [ ] y-sweet being down reads as unavailable, never as an auth failure
- [ ] Remote changes do not trigger a save on every connected client
- [ ] Merged content reaches Postgres, and version history still records a snapshot per author
- [ ] Backend, Vitest, and Playwright all pass; Playwright twice in a row

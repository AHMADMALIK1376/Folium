# Folium Phase 4-ii — Collaboration durability

**Date:** 2026-08-01
**Status:** Approved, not yet implemented
**Scope:** Say who is who, say when the connection drops, and make sure the last edits reach Postgres.

---

## 1. Context

Phase 4-i shipped live collaboration: two people edit one document, see each other's text and cursors,
and Postgres stays the record of truth. Three gaps were recorded rather than fixed, and this phase
closes all three.

| | |
|---|---|
| **Cursors are mislabelled** | Every participant's caret carries the *document owner's* name, because the editor only ever had that one profile to hand. On someone else's document, you appear as them. |
| **Losing the connection is silent** | The provider drops and reconnects with nothing on screen either way. Typing into a disconnected editor looks identical to typing into a live one. |
| **The last edits can miss Postgres** | The client that made a change saves it. If everyone closes their laptop mid-sentence, the merged text lives in y-sweet and the database is behind. |

---

## 2. Who is who

The editor is handed the *document*, which carries its owner's profile — and it used that for the
cursor label, which is wrong for everyone except the owner.

The collaboration endpoint already knows exactly who is asking: it authenticated them to decide
whether to mint a token at all. So it returns them. `POST /documents/{id}/collab` gains a `user`
object — id and display name — and the editor labels the caret with that.

No extra round trip, and no `/me` call from the editor: the request that establishes the session is
the one that already knows the answer.

The colour keeps deriving from the user id, so a person is the same colour to everyone, in every
document, across reloads.

---

## 3. Saying when the connection drops

The provider exposes a connection status and emits changes. The editor surfaces three states beside
the save indicator, and only when collaboration is actually on:

| Status | Shown |
|---|---|
| Connected | **Live** |
| Connecting or handshaking | **Connecting…** |
| Offline or errored | **Offline — reconnecting** |

y-sweet's provider retries on its own, so there is no reconnect button to press; the honest thing is
to say what is happening and let it recover. What must not happen is silence, which is what shipped in
4-i: a disconnected editor looked exactly like a live one, and the text you type while offline is not
being shared with anyone.

Edits made while offline are not lost. They stay in the local Y.Doc and merge on reconnect, and
autosave keeps writing to Postgres over plain HTTP regardless — the two paths fail independently.

---

## 4. Making sure the last edits land

The failure is narrow and real: everyone in a room closes their browser within the autosave debounce,
and the merged document lives in y-sweet while Postgres holds a slightly older copy.

### Reconciling in the browser, not the server

The obvious design is server-side: read the room with `pycrdt`, convert Yjs XML to TipTap JSON, write
it back. **It is not available.** `y-sweet-sdk` pins `pycrdt~=0.9.11`, and XML types — `XmlFragment`,
`XmlElement`, `XmlText` — only arrive in later versions. Taking that route means either violating the
pin or hand-writing a Yjs XML decoder in Python, to duplicate a conversion the browser already does
correctly.

So it happens in the browser, at the one moment both copies are in hand: **when a client syncs.**

On `synced`, the client holds the room's merged content and the server's copy, and does one of three
things:

1. **Room empty, Postgres has content** → seed the room. This is 4-i's rule, unchanged.
2. **Room has content that differs from Postgres** → save it. This is the new one, and it is exactly
   the "everyone closed their laptop" recovery: the next person to open the document repairs it.
3. **They match** → nothing.

The next reader repairs the record. Not instant, but it needs no background worker, which a free tier
cannot run anyway, and it reuses the save path that is already tested.

A save made this way must be attributed and snapshotted like any other, so Phase 3's version history
records it — including the rule that a different author always earns a snapshot.

---

## 5. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend | pytest | The collab response carries the caller's id and display name — the caller's, not the owner's |
| Frontend unit | Vitest | The cursor label uses the signed-in user; status maps provider states to the three messages; reconciliation saves when the room differs and stays quiet when it matches |
| End to end | Playwright | Two accounts: each sees the *other's* name on the other's caret, not the owner's name twice |

The reconciliation path is deliberately unit-tested rather than driven end to end. Reproducing it for
real means killing two browsers inside an 800ms window and reopening — timing-dependent, slow, and
prone to passing for the wrong reason. The decision it makes is pure and worth testing directly.

---

## 6. Out of scope

- A presence list, avatars, or "3 people viewing".
- Showing *what* someone changed, or per-user attribution inside the text.
- Server-side reconciliation, until `pycrdt`'s XML types are reachable without breaking the SDK's pin.
- Offline queueing beyond what Yjs does by itself.
- Comments, and granting the `comment` permission.

---

## 7. Definition of done

- [ ] Each participant's caret carries their own name, not the document owner's
- [ ] Two people in one document see two different names and two different colours
- [ ] A person is the same colour in every document and after a reload
- [ ] The editor says Live, Connecting, or Offline — and never stays silent about being disconnected
- [ ] The indicator appears only when collaboration is on
- [ ] Opening a document whose room is ahead of Postgres writes the room's content back
- [ ] That write is snapshotted like any other edit
- [ ] A room that matches Postgres triggers no write
- [ ] With no y-sweet configured, nothing above changes the editor's behaviour
- [ ] Backend, Vitest, and Playwright all pass; Playwright twice in a row, with and without collaboration

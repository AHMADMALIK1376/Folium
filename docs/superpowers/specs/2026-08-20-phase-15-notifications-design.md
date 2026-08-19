# Folium Phase 15 — Notifications and mentions

**Date:** 2026-08-20
**Status:** Implemented
**Scope:** Tell someone when something happened to them. Let a commenter address someone by name.

---

## 1. Why the two are one phase

Phase 14 shipped comments, and a comment nobody hears about is a note left on a desk in an empty
room. The owner of a document has no way to learn that someone asked them a question in it short of
opening the document and scrolling.

Mentions are the other half of the same problem. `@Ada` in a comment is a way of saying "this part
is for you" — and it means nothing unless Ada finds out. Notifications without mentions is half a
feature; mentions without notifications is none of one.

---

## 2. What generates a notification

Four things, and no others.

| Event | Who hears |
|---|---|
| A comment on a document | Its owner |
| A reply to a thread | Whoever started the thread |
| A mention in a comment | The person mentioned |
| A document is shared with you | You |

**Never yourself.** Commenting on your own document, replying to your own thread and mentioning
yourself all produce nothing. This is the rule most likely to be got wrong and most obviously wrong
when it is.

**One event, one notification.** A reply that also mentions the thread's author is a mention, not
both — the more specific kind wins, because "Ada mentioned you" says everything "Ada replied" says
and more.

Not included, deliberately: edits, resolutions, deletions, folder changes, restores. Each is either
routine or something the person doing it already knows about. A notification list that fills with
things nobody wanted is one people stop reading, and then the four that matter are lost too.

---

## 3. The rule that makes this safe

**A notification must never outlive the access it was created under.**

Someone is shared a document, gets notified about a comment, and their share is then revoked. The
row is still in the table, and it carries a document title. Showing it would leak the document to
someone who has lost access to it.

So the list endpoint **re-checks access on every read** — it joins to the document and its shares,
and returns only notifications for documents the caller can still see. The alternative, deleting
notifications when a share is revoked, is a cleanup job that fails silently the first time someone
adds another way to lose access.

---

## 4. Mentions are stored, not parsed

A mention is a row in `comment_mentions`, written when the comment is created, not text scraped out
of the body afterwards.

Parsing would have to answer "where does `@Ada Lovelace` end?" — display names contain spaces, and
there is no reliable answer. The client already knows exactly who was picked from the list, so it
says so: `mention_user_ids` alongside the body. The body still reads `@Ada Lovelace` as ordinary
text.

**You may only mention someone who can already see the document.** Mentioning anyone else would
either leak the document's existence to them or promise them a link they cannot open. The backend
refuses with 422 rather than silently dropping the mention, because a silently dropped mention is a
message the sender believes they sent.

---

## 5. The data model

```
notifications
  id           uuid  pk
  user_id      uuid  -> users(id)     ON DELETE CASCADE   the recipient
  actor_id     uuid  -> users(id)     ON DELETE SET NULL  who did it
  kind         text                                       comment | reply | mention | share
  document_id  uuid  -> documents(id) ON DELETE CASCADE
  comment_id   uuid  -> comments(id)  ON DELETE CASCADE   null for a share
  read_at      timestamptz null
  created_at   timestamptz

comment_mentions
  comment_id   uuid  -> comments(id)  ON DELETE CASCADE
  user_id      uuid  -> users(id)     ON DELETE CASCADE
  primary key (comment_id, user_id)
```

**`document_id` and `comment_id` CASCADE.** A notification pointing at a deleted comment is worse
than no notification: it promises something to look at and delivers a 404. This is the opposite of
the folders rule and right for the opposite reason — the notification exists *because* of the thing,
and has no meaning without it.

**`actor_id` is SET NULL**, like every other actor column here: "Someone commented" is still true
after the account is gone.

---

## 6. Delivery is polling, and that is a decision

The browser fetches the unread count when a page loads and every 60 seconds after. No websocket, no
server-sent events.

y-sweet exists but is per-document and optional; a second realtime system would be a second thing to
operate, deploy and debug for a feature whose entire requirement is "within a minute is fine". If
notifications ever need to be instant, the room is already there to carry them.

The count is refreshed immediately after anything that could change it, so the common case — you
comment, then look — is not waiting on a poll.

---

## 7. The API

```
GET   /api/v1/notifications              -> the caller's, newest first, access re-checked
GET   /api/v1/notifications/unread-count -> { count }
POST  /api/v1/notifications/read         -> mark some or all read  { ids? }
```

`POST .../read` with no ids marks everything read. With ids, only those, and only the caller's —
someone else's id is ignored rather than refused, because a partial batch is not an error and
telling the caller which ids were not theirs would confirm they exist.

Notifications are never created through the API. They are a consequence of other actions, written in
the same transaction as the thing that caused them.

---

## 8. The interface

- A bell in the header with an unread count. No count when there is nothing unread — a zero badge is
  noise that trains people to ignore the thing next to it.
- Opening it lists the notifications, unread first, each naming the actor, what they did, and which
  document. Clicking one goes to the document and marks it read.
- **Mark all read** is there because the alternative is clicking twelve things.
- In a comment box, `@` opens a list of the people who can see the document. Picking one inserts
  their name and records the mention.

| Situation | Behaviour |
|---|---|
| Nothing yet | Says what will appear here, rather than showing a blank |
| The document was deleted | The notification is gone with it |
| Access was revoked | The notification is not shown, though its row remains |
| Nobody to mention | `@` does nothing — no empty menu |

---

## 9. Testing

| Layer | Coverage |
|---|---|
| Backend | Each of the four kinds is created, and none of them for the actor themselves |
| Backend | A mention beats a reply for the same person and comment |
| Backend | A notification for a document you can no longer see is not listed |
| Backend | Mentioning someone without access is 422 |
| Backend | Deleting a comment or document takes its notifications with it |
| Backend | Marking read: all, some, and someone else's id ignored |
| Frontend | The bell shows a count, hides at zero, lists and marks read |
| Frontend | The mention picker offers only people with access |
| End to end | Two people: one comments and mentions, the other sees the bell and follows it to the document |

---

## 10. Out of scope

- **Email.** It needs a sending service, deliverability, templates and an unsubscribe story, and
  none of that is a notification feature — it is a mail feature wearing one.
- Per-kind preferences, digests, muting a thread.
- Notifying on edits, resolutions or deletions. See §2.

---

## 11. Definition of done

- [x] All four kinds are generated, never for the actor themselves
- [x] A notification is never shown for a document the caller can no longer see
- [x] Mentions are stored, restricted to people with access, and refused loudly otherwise
- [x] The bell shows an unread count and clears it
- [x] Backend, Vitest and Playwright pass

---

## 12. Two bugs the build found, both about giving up too easily

**The mentionable list was fetched once, at mount.** Share someone in while the document is open —
which is exactly when you then want to mention them — and the picker had never heard of them. It now
refreshes when someone starts composing, which is the moment the list has to be right.

**The bell went silent for a minute when its first request failed.** It mounts with the page, which
can be before the Supabase client has restored the session from storage; `apiFetch` then throws
"Not signed in" before any request is made. The failure was swallowed and the next attempt was a
full poll interval away, so the bell said nothing about something that had already happened —
intermittently, which is the worst way for it to be wrong. A failed attempt now retries in three
seconds; a successful one waits the minute.

The second was found by a Playwright test that failed about half the time. Chasing it produced three
wrong theories before the evidence arrived, and a fourth fix that was right for an unrelated reason:
the browser API client never sent `cache: "no-store"`, though `serverApiFetch` had since 2C-i. Every
response it handles is per-user and mutable and FastAPI sends no `Cache-Control`, which leaves the
browser free to serve a stale body. That is kept.

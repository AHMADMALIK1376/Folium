# Folium Phase 18 — Duplication and templates

**Date:** 2026-08-20
**Status:** Implemented
**Scope:** Start a document from something that already exists.

---

## 1. Why this and not email

Notifications have no email delivery, and that is the biggest thing the app
promises and does not do. It is also not buildable here: it needs a sending
service, an account, credentials, a verified sending domain, and an unsubscribe
story. Half of it shipped is worse than none of it, because a notification
system that *sometimes* emails is one nobody can trust.

Duplication and templates need nothing outside the app, and cover the thing it
currently cannot do at all: **every document starts empty.** Anyone who writes
the same shape of document twice — a weekly report, a meeting note, a brief —
has to rebuild it by hand or copy-paste from the last one.

---

## 2. Duplication

**Duplicate any document you can see.** Not just your own: if you can read it,
you can already export it as Markdown and import the file back, which produces
a worse copy through more steps. Refusing the button would not protect
anything.

The copy is **yours and fresh**:

| Carried over | Left behind | Why |
|---|---|---|
| Title, prefixed "Copy of" | Shares | A copy is not a re-share. Deciding who sees it is the copier's to make |
| Content | Comments | A discussion is about the document it happened on |
| Attachments | Version history | The copy has no past |
| | Stars | A star is a private bookmark, not a property of the document |
| | Template flag | A copy of a template is a document, which is the point of using one |

**Attachments are copied, and the content is rewritten to point at the copies.**
This is the part that would be tempting to skip, and skipping it produces a
document whose images work today and break the moment the original is deleted
or unshared. A duplicate that quietly rots is worse than no duplicate. Each
attachment is copied in storage, and every `/attachments/{old}/raw` in the
content becomes `/attachments/{new}/raw`.

When the deployment has no storage configured there are no attachments, and
this costs nothing.

---

## 3. Templates

A template is **a document with a flag on it**, not a separate kind of thing.

That is the whole design. A template is written in the same editor, kept in the
same list, exported the same way. The flag says "offer this when starting
something new"; it changes nothing else about the document.

- Mark your own document as a template from the editor.
- **New from template** on the dashboard offers your templates, plus the
  built-in ones.
- Creating from a template is duplication with a different name: the new
  document takes the template's title without "Copy of", and is not itself a
  template.

**Built-in templates live in the frontend as content**, not as rows. They are
the same TipTap JSON any document is, they are identical for everyone, and a
row per user per template would be a migration and a seeding job to say
something a constant already says. Three of them: a meeting note, a weekly
update, and a project brief.

---

## 4. Who may do what

| Action | Who |
|---|---|
| Duplicate a document | Anyone who can view it |
| Mark a document as a template | Its owner |
| Use a template | Anyone who can view it — yours are yours, built-ins are everyone's |

A template you own that is shared with someone appears in *their* picker too,
which is the useful behaviour for a team with a house format.

---

## 5. The API

```
POST  /api/v1/documents/{id}/duplicate  -> 201, the new document
PATCH /api/v1/documents/{id}            -> { is_template }   owner only
GET   /api/v1/documents                 -> each item carries is_template
```

`is_template` rides the document PATCH for the same reason `folder_id` does: it
is a property of the document, not an action performed on it. And for the same
reason it uses `model_fields_set` — `false` is meaningful, so its absence has
to be distinguishable from it.

Duplication is a POST to the original rather than a create-with-source, because
the thing being described is an act on an existing document.

---

## 6. The interface

- **Duplicate** on every document card, owned or shared.
- **New from template** beside New document, listing built-ins and your own.
- **Save as template** in the editor, for an owner.
- A template is marked in the list, so "why is this in my picker" has an answer
  on screen.

| Situation | Behaviour |
|---|---|
| No templates of your own | The picker still opens — the built-ins are always there |
| Duplicating a large document | The button says what it is doing; copying attachments is not instant |
| Storage not configured | Nothing to copy, and no mention of it |

---

## 7. Out of scope

- A template gallery, categories, or sharing templates publicly.
- Variables or placeholders that get filled in on use. That is a different
  feature — a form — wearing a template's clothes.
- Duplicating a folder, or a document's comments.

---

## 8. Testing

| Layer | Coverage |
|---|---|
| Backend | A duplicate carries title and content, and leaves shares, comments, versions and stars behind |
| Backend | Attachments are copied and the content is rewritten to the new ids |
| Backend | Someone with view access can duplicate; a stranger gets 404 |
| Backend | Only the owner can mark a template; `is_template` survives a title-only save |
| Backend | A duplicate of a template is not itself a template |
| Frontend | The template picker lists built-ins and your own |
| End to end | Duplicate a document and find both; create from a built-in template |

---

## 9. Definition of done

- [x] Duplicate works for anyone who can view, and the copy is independent
- [x] Attachments are copied and image references rewritten
- [x] A document can be marked a template and used from the dashboard
- [x] Built-in templates work with no templates of your own
- [x] Backend, Vitest and Playwright pass

---

## 10. One thing worth recording from the build

**A file that cannot be copied is skipped, not fatal.** Losing an entire
duplication because one image is missing from storage would be a worse outcome
than a copy with one image still pointing at the original — which keeps working
for as long as the original does. The content rewrite only redirects the
attachments that actually copied, so a skipped one is left pointing where it
already worked.

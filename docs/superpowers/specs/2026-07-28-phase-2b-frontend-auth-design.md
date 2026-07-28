# Folium Phase 2B — Frontend Design System and Auth Pages

**Date:** 2026-07-28
**Status:** Approved, not yet implemented
**Scope:** Tailwind + shadcn/ui, the carmine design system, and real Supabase sign-up / sign-in pages.

---

## 1. Context

Phase 2A replaced the backend's development-only auth header with real Supabase JWT verification.
The backend is finished and tested at 147 passing tests — but **no browser can reach it**. The
frontend is still the v1 application: hand-written CSS, mocked seeded accounts, its own Next.js API
routes, and a local SQLite file.

Phase 2 was split three ways. This is the second part:

| | Deliverable | Status |
|---|---|---|
| 2A | Backend Supabase JWT verification | Done |
| **2B** | **This spec.** Design system and auth pages. | This phase |
| 2C | Rewire dashboard and editor to FastAPI; delete v1 routes, `db.ts`, `repo.ts`, SQLite | Next |

### The milestone

At the end of 2B you can sign up with a real email address, log in, and land on a page showing
**your profile fetched from the FastAPI backend**.

That single request is the point. It exercises the entire chain for the first time: Supabase Auth
issues a JWT, the browser attaches it, FastAPI fetches Supabase's public keys, verifies the
signature, provisions a `users` row from the token claims, and returns the profile. Until that
works, 2A is only theoretically connected to anything.

### Decisions carried in from brainstorming

1. **Email/password and magic link are built and verified.** Google and GitHub OAuth need apps
   registered in their own consoles — external work that would block the phase. The buttons are
   built and styled but hidden behind a flag, so enabling them later is configuration, not a
   rebuild.
2. **The v1 app goes dark.** The new sign-in takes over `/login`, which leaves the old dashboard
   and editor unreachable until 2C rewires them. Running two auth systems and two databases side by
   side for one phase costs more than it's worth. The v1 files stay in the repository as a
   reference; they are simply not linked from anywhere.
3. **No restyling of the old dashboard or editor.** They are rebuilt against FastAPI in 2C.
   Restyling them now means doing the same work twice.

---

## 2. Route structure

```
src/app/
  (auth)/
    layout.tsx          centred card shell, logo, no navigation
    login/page.tsx      password form, with a magic-link toggle
    signup/page.tsx
    reset-password/page.tsx
    callback/route.ts   exchanges the code Supabase redirects back with
  (app)/
    layout.tsx          authenticated shell, header, sign-out
    account/page.tsx    profile loaded from GET /api/v1/me
  page.tsx              signed in -> /account, otherwise -> /login
middleware.ts           guards (app)/*
```

Route groups — the parentheses — do not appear in URLs. They exist so the signed-out pages and the
signed-in pages can have completely different layouts without either knowing about the other.

**Out of scope:** the `(marketing)` landing page from the Phase 1 spec. It is real design work and
contributes nothing to making authentication usable. `/` simply redirects.

---

## 3. Session handling

### Cookies, not localStorage

Sessions are stored in cookies via `@supabase/ssr`, rather than Supabase's default localStorage.

Next.js Server Components and middleware execute on the server, where localStorage does not exist.
With cookies the server can decide *before rendering* whether a request is authenticated. A
signed-out user hitting `/account` is redirected in middleware and never sees a protected page
flash on screen while JavaScript boots — which is both a visual defect and a brief information
leak.

### Reaching FastAPI

A typed API client in `src/lib/api/` attaches `Authorization: Bearer <token>` to every request.

**It reads the token per request rather than caching it.** Supabase access tokens expire after an
hour and the client library refreshes them in the background; a cached token would go stale and
start producing 401s that look exactly like a backend fault. Asking for the current session each
time costs nothing and removes that entire class of bug.

The client raises a typed error carrying the HTTP status, so callers can distinguish 401
(re-authenticate) from 503 (Supabase key endpoint unreachable — the case 2A deliberately made
distinguishable) from a genuine 500.

### Middleware

`middleware.ts` refreshes the session cookie and guards `(app)/*`. Unauthenticated requests are
redirected to `/login` carrying a `redirectTo` parameter, so signing in returns the user where they
were headed rather than dumping them on a default page.

---

## 4. Design system

### Tailwind v4 with shadcn/ui

Tailwind v4 configures through CSS rather than a `tailwind.config.js`, which suits this project:
the carmine palette becomes CSS custom properties, and that is precisely the form shadcn/ui
consumes for theming. One definition, used by both.

shadcn components are copied into the repository rather than installed as a dependency, so they can
be edited directly. Only what the auth pages need: `button`, `input`, `label`, `card`, `alert`,
`form`, `separator`, `sonner`.

### Tokens

```css
--carmine-50:  #FDF2F2;   subtle tint backgrounds
--carmine-500: #D41F26;   brand: primary buttons, links, focus rings
--carmine-600: #B01A20;   hover
--carmine-700: #8C1419;   pressed, and error text
--white:       #FFFFFF;   surfaces, text on carmine
--neutral-50:  #FAFAFA;   page background
--neutral-200: #E4E4E7;   borders, dividers
--neutral-500: #71717A;   secondary text, placeholders
--neutral-900: #18181B;   body text
```

### The red-on-red problem

The brand colour is red, and red is the universal convention for errors. Without care, a validation
message and a primary button look like the same thing.

Resolution: **errors use `carmine-700`** — visibly darker than the brand `carmine-500` — and always
appear with an icon and a `carmine-50` background. Colour alone never carries the meaning, which
also keeps the interface usable for red-green colour blindness. Destructive confirmations use the
same darker shade plus an explicit dialog.

Carmine on white measures roughly **5.2:1** contrast: passes WCAG AA for normal text, fails AAA. It
is an accent colour, never body copy.

### Forms

`react-hook-form` with `zod` resolvers. Zod is already a dependency, and the same schema shapes both
client validation and the expected server contract — one definition rather than two that drift.

Validation errors appear beneath their field, with `aria-invalid` and `aria-describedby` wired so
screen readers announce them. Submit buttons disable and show a pending state during the request,
because double-submitting a sign-up is an easy and confusing mistake to make.

---

## 5. Authentication flows

| Flow | Behaviour |
|---|---|
| Sign up | Email + password. On success, an instruction to check the inbox. |
| Log in (password) | Email + password, then redirect to `redirectTo` or `/account`. |
| Log in (magic link) | Email only. Supabase sends a sign-in link; the page confirms it was sent. |
| Reset password | Request a link, then set a new password on return. |
| Callback | `(auth)/callback` exchanges Supabase's code for a session, then redirects. |
| Sign out | Clears the session and returns to `/login`. |

### Errors are deliberately vague on purpose

A failed login says *"Those details didn't match an account"* — never *"no account with that email"*.
Distinguishing the two turns the login form into a tool for discovering who has an account.

Sign-up behaves the same way: submitting an address that already exists shows the same
check-your-inbox message a new address does. Supabase emails the existing owner a notice instead.
Anything else lets a stranger enumerate your users.

Rate-limit responses (Supabase returns 429) get their own clear message, because "try again later"
is actionable and a generic failure is not.

### Two dashboard settings you control

- **Email confirmation** is on by default and correct for production, but during development every
  test signup needs a real inbox. Toggle it off under *Authentication → Sign In / Providers* while
  building, and re-enable it before launch.
- **Free-tier email is rate-limited** to a handful per hour on Supabase's shared SMTP. Sign-up,
  magic link, and password reset all draw from that budget. Configuring a custom SMTP provider
  lifts it; not needed for development.

---

## 6. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | API client: token attachment, typed errors by status |
| Component | Vitest + React Testing Library | Form validation, error rendering, pending states |
| End-to-end | Playwright (Chromium only) | Sign up → log in → `/account` → sign out; guard redirect |
| Type | `tsc --noEmit` | Already in CI |

The Supabase client is mocked in the Vitest layers. Those tests may never require network access or
real credentials — the same rule 2A's backend suite already follows.

### Playwright

Runs locally against a real Supabase project, **not in CI**. CI has no Supabase credentials, and
adding them would mean putting a production database password into GitHub secrets and letting every
CI run create accounts. The E2E suite is a local pre-merge check instead, and CI keeps its existing
lint / type-check / unit-test gate.

**Chromium only.** Cross-browser coverage buys little for an auth form and triples the download.

**Two hard prerequisites, both outside the code:**

1. **Email confirmation must be off** in Supabase (*Authentication → Sign In / Providers → Email →
   Confirm email*). With it on, a new account cannot log in until a link in a real inbox is clicked,
   which no unattended test can do. Re-enable before launch.
2. **Free-tier email is rate-limited** to a handful per hour. Tests must therefore use
   password sign-up rather than magic link, and generate a unique address per run so they stay
   idempotent — the same lesson that broke the backend suite in 2A, where fixed emails passed once
   and then collided forever.

Each run creates a real account in the shared database. `backend/scripts/clean_test_data.py`
removes them; E2E accounts use `@example.com` so that script already matches them.

### Downloads stay on D:

The system drive is short of space, so nothing this project fetches may land on C:. Playwright's
browsers default to `%LOCALAPPDATA%\ms-playwright`; they are redirected to
`D:\AJAIA\Folium\.playwright-browsers` via `PLAYWRIGHT_BROWSERS_PATH`, set inside the npm scripts so
it applies without depending on a machine-wide environment variable. npm's cache is likewise
redirected to `D:\AJAIA\Folium\.npm-cache` in `frontend/.npmrc`. Both directories are gitignored.

---

## 7. Out of scope

- The marketing landing page.
- Google and GitHub OAuth *configuration*. The buttons exist behind
  `NEXT_PUBLIC_ENABLE_OAUTH`; registering the apps is later work.
- Rewiring the dashboard or editor to FastAPI, and deleting the v1 API routes, `db.ts`, `repo.ts`,
  or the SQLite dependency — all 2C.
- Real-time collaboration, version history, billing.
- Custom SMTP configuration.

---

## 8. Definition of done

- [ ] A new account can be created, and its user row appears in the database provisioned from the
      token claims.
- [ ] Logging in with a password reaches `/account`, which displays the profile returned by
      `GET /api/v1/me`.
- [ ] Magic-link sign-in completes through `(auth)/callback`.
- [ ] Requesting `/account` while signed out redirects to `/login` with no protected content
      rendered first.
- [ ] Signing in from a guarded page returns to the originally requested page.
- [ ] A failed login never reveals whether the email exists.
- [ ] Signing out clears the session; `/account` is then unreachable.
- [ ] Every interactive element is reachable and operable by keyboard, with a visible focus ring.
- [ ] `npm run build`, `tsc --noEmit`, and the Vitest suite all pass; CI stays green.
- [ ] The Playwright suite passes locally, and its browsers live under
      `D:\AJAIA\Folium\.playwright-browsers` — nothing added to `%LOCALAPPDATA%`.
- [ ] Repeated Playwright runs pass without collisions, the way the backend suite does.
- [ ] No backend files changed.

# Folium Phase 2A — Backend Authentication Design

**Date:** 2026-07-27
**Status:** Approved, not yet implemented
**Scope:** Replace the development-only authentication stand-in with real Supabase JWT verification.

---

## 1. Context

Phase 1 shipped a working FastAPI backend, but with a deliberate placeholder: `get_current_user`
trusts an `X-Dev-User-Email` header, hard-gated so it raises 401 unless `ENVIRONMENT=development`.
That was always a seam, built so this phase changes one function and no routes.

Phase 2 as a whole is too large for one spec, so it is split:

| | Deliverable | Depends on |
|---|---|---|
| **2A** | **This spec.** Backend Supabase JWT verification and user provisioning. | Nothing |
| 2B | Frontend design system (Tailwind, shadcn/ui, carmine) and auth pages. | 2A |
| 2C | Frontend cut-over to FastAPI; delete the v1 API routes, `db.ts`, `repo.ts`, and SQLite. | 2A, 2B |

2A is deliberately first: it is the smallest unit, it is testable entirely through the API with no
frontend changes, and it unblocks the other two.

### Decisions carried in from brainstorming

1. **One auth path.** The `X-Dev-User-Email` header is deleted, not disabled. Tests mint their own
   signed tokens and exercise the identical verification code production uses. Phase 1 already
   shipped one critical fail-open bug in the dev gate; a second auth path is the same risk shape.
2. **Asymmetric verification (JWKS).** The backend holds only a public key and cannot mint tokens,
   so a leaked backend environment cannot be used to forge sessions.
3. **Sign-in methods** (email/password, Google, GitHub, magic link) are a 2B concern. A Supabase JWT
   is identical regardless of how the user signed in, so 2A is unaffected by that choice.

---

## 2. What changes

```
Before:  X-Dev-User-Email header        → look up or create user
After:   Authorization: Bearer <jwt>    → verify JWT → look up or create user
```

`get_current_user` keeps its signature and still returns a `User`. All 12 routes, every service
function, and every permission check are untouched. The change is confined to `app/api/deps.py`, a
new verification module, config, and tests.

---

## 3. Token verification

### The chain

1. Read the `Authorization: Bearer <token>` header. Absent or malformed → 401.
2. Read the token's `kid` (key id) header without verifying anything.
3. Resolve `kid` to a public key from the cached JWKS (see caching below).
4. Verify the signature, then the claims.
5. Extract `sub`, `email`, and `user_metadata`.

### Claims validated

| Claim | Requirement |
|---|---|
| `exp` | Must be in the future. 60 seconds of leeway for clock skew. |
| `iss` | Must equal `{SUPABASE_URL}/auth/v1` exactly. |
| `aud` | Must equal `authenticated`. |
| `sub` | Must be present and a valid UUID. |

### Algorithm pinning — the security-critical detail

Verification passes an explicit algorithm allowlist to the JWT library — `["ES256", "RS256"]` — and
never derives it from the token's own `alg` header. `HS*` and `none` are absent from that list and
so are rejected before any signature check runs.

This is not defensive padding. If a verifier accepts both asymmetric and HMAC algorithms, an
attacker takes the public key — public by definition, served at a well-known URL — signs a forged
token using it as an HMAC secret, and a naive verifier accepts it as authentic. Pinning the
algorithm list is what closes it.

### JWKS caching and failure modes

- Public keys are fetched from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` and cached in memory
  with a **10-minute TTL**.
- An **unknown `kid`** triggers exactly one refetch, then fails. This is how key rotation surfaces,
  and the single-retry bound stops an attacker forcing unbounded outbound requests by sending
  random key ids.
- If the JWKS endpoint is unreachable **and** the cache is empty, requests fail with **503**. They
  are never allowed through. Failing open here would defeat the entire system.
- If the cache holds usable keys, a fetch failure is tolerated — a Supabase blip does not log
  everyone out.

### Error responses

Every verification failure returns a **generic 401** with the same body. The specific reason —
expired, bad signature, wrong issuer, unknown key — is logged server-side only. Telling a caller why
their forged token was rejected is free reconnaissance.

The one exception is the 503 above, which is an infrastructure failure rather than an auth decision
and should be distinguishable so it is not misdiagnosed as everyone's credentials breaking at once.

---

## 4. User provisioning

Supabase owns identity; Folium owns application data. The bridge is the `sub` claim, which becomes
`users.id` directly — exactly what the Phase 1 schema anticipated.

**Provisioning is on-demand, at first authenticated request.** When a verified token arrives bearing
a `sub` with no matching row, one is inserted from the token's claims:

| Column | Source |
|---|---|
| `id` | `sub` |
| `email` | `email` claim, lowercased |
| `display_name` | `user_metadata.full_name`, else `user_metadata.name`, else the email's local part |
| `avatar_url` | `user_metadata.avatar_url` if present |

### Why not a database trigger or webhook

A Postgres trigger on Supabase's `auth.users` would couple the schema to Supabase internals and stop
working the moment the database moves — defeating the reason Folium keeps its own `users` table. A
webhook adds an endpoint, a shared secret, and a delivery-failure mode. On-demand provisioning needs
no extra infrastructure and behaves identically in tests, with no Supabase involved.

### Edge cases

- **Concurrent first requests.** Two simultaneous requests from a new user could race. Handled with
  an insert that tolerates conflict followed by a re-select — never check-then-insert, which is
  precisely where that race lives.
- **Email already held by a different `sub`.** Supabase enforces unique emails in `auth.users`, so
  this should be unreachable. If it happens it indicates real data corruption: fail with a logged
  error rather than silently reassigning a user's documents.
- **Existing development rows are orphaned.** Users created by the dev header have random UUIDs
  matching no Supabase user. There is no production data, so they are cleared during rollout.
- **Claims can change.** Email and display name are refreshed on each request when they differ from
  the stored row, so a Supabase profile change propagates without a separate sync job.

---

## 5. Configuration

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL. The issuer and JWKS URL are derived from it, not configured separately, so they cannot drift apart. |

`SUPABASE_SERVICE_ROLE_KEY` is **not** required. The backend only verifies tokens; it never calls
Supabase's admin API. Not holding that key at all is stronger than holding it carefully.

`ENVIRONMENT` remains, but no longer gates authentication — it controls whether interactive API docs
are exposed. Its default stays `production` so an unset value remains the safe value.

**Asymmetric support is confirmed, not assumed.** The project's JWKS endpoint was queried during
design and returns HTTP 200 with a single `ES256` key on curve `P-256`, marked `use: sig` /
`key_ops: ["verify"]`:

```json
{"keys":[{"alg":"ES256","crv":"P-256","kty":"EC","use":"sig","kid":"ffc68600-…","x":"…","y":"…"}]}
```

No HS256 fallback path is needed or will be written. Should a future project ever lack asymmetric
keys, the fix is to migrate it in the Supabase dashboard — never to add a second verification path.

---

## 6. Testing

Tests mint their own tokens. No network, no Supabase, no fixture files containing real credentials.

**Harness:** a session-scoped fixture generates an EC keypair, exposes the public half as a JWKS
document, and patches the key fetcher to serve it. A `make_token(...)` helper mints tokens with
overridable claims. The production verification path runs unchanged — only the source of the keys is
substituted.

**Cases:**

| Case | Expected |
|---|---|
| Valid token | 200, user resolved |
| Missing `Authorization` header | 401 |
| Malformed header (no `Bearer`, garbage) | 401 |
| Expired token | 401 |
| Signature from the wrong key | 401 |
| Wrong `iss` | 401 |
| Wrong `aud` | 401 |
| Missing or non-UUID `sub` | 401 |
| **`HS256` token signed with the public key** | **401** — the algorithm-confusion attack |
| **`alg: none`** | **401** |
| Unknown `kid` | one refetch, then 401 |
| JWKS unreachable, cache empty | 503, never 200 |
| First request for a new `sub` | user row created from claims |
| Second request for the same `sub` | same user, no duplicate row |
| Changed email in a later token | stored row updated |
| Every failure body | identical generic message |

The algorithm-confusion and fail-open cases are the two that matter most: both are silent, total
compromises that a passing functional test suite would not otherwise catch.

---

## 7. Out of scope

- All frontend work — Supabase client, login pages, session handling (2B and 2C).
- OAuth provider registration in Google Cloud and GitHub (2B, and requires the owner's accounts).
- Email templates and SMTP configuration.
- Row Level Security. All data access is mediated by FastAPI, which holds the database credentials;
  the frontend never queries Postgres directly.
- Roles, permissions, or admin users beyond the existing document-level sharing model.
- Refresh-token rotation and session lifetime, which Supabase's client library owns.

---

## 8. Definition of done

- [ ] `X-Dev-User-Email` appears nowhere in the codebase.
- [ ] Every `/api/v1` route requires a valid Supabase-issued JWT.
- [ ] An `HS256` token signed with the public key is rejected.
- [ ] An unreachable JWKS with an empty cache yields 503, never 200.
- [ ] A new user's row is provisioned on first request, with no duplicate under concurrency.
- [ ] The full backend suite passes, including all cases in section 6.
- [ ] CI stays green with no Supabase credentials configured — tests must not depend on the network.

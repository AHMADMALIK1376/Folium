# Folium Phase 2B — Frontend Design System and Auth Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Tailwind + shadcn/ui with the carmine palette, real Supabase sign-up and sign-in pages, and an authenticated `/account` page that loads the user's profile from the FastAPI backend.

**Architecture:** Next.js App Router with two route groups — `(auth)` for signed-out pages and `(app)` for signed-in ones — so each gets its own layout without knowing about the other. Sessions live in cookies via `@supabase/ssr`, letting `middleware.ts` reject unauthenticated requests before any protected markup renders. A typed API client attaches the current access token to every FastAPI call, reading it fresh per request because Supabase rotates tokens hourly.

**Tech Stack:** Next.js 15.5, React 18.3, TypeScript, Tailwind v4, shadcn/ui, `@supabase/ssr`, `@supabase/supabase-js`, react-hook-form, zod 3.23, Vitest, React Testing Library, Playwright (Chromium).

## Global Constraints

- **React 18.3, not 19.** Do not use React 19-only APIs (`useActionState`, the new `use()` for promises). Some shadcn snippets assume 19 — adapt them.
- Next.js 15: `cookies()`, `headers()`, and dynamic route `params` are **async** and must be awaited.
- **Nothing may download to `C:`.** npm cache is redirected in `frontend/.npmrc`; Playwright browsers go to `D:\AJAIA\Folium\.playwright-browsers` via `PLAYWRIGHT_BROWSERS_PATH` set inside npm scripts.
- Brand colours are exactly **carmine `#D41F26`** and **white `#FFFFFF`**, plus a neutral ramp. Errors use **`carmine-700` (`#8C1419`)** with an icon and tinted background — never colour alone.
- **Auth errors must never reveal whether an account exists.** Failed login and duplicate sign-up both return a generic message.
- The API client reads the access token **per request**; never cache it in a module variable.
- **No backend files may change.** `backend/` is finished and passing at 147 tests.
- Existing v1 pages (`/dashboard`, `/documents/[id]`) and `src/app/api/**` are left in place, unlinked. Do not delete them — that is Phase 2C.
- `npm test` must keep running the existing v1 `node --test` suite; Vitest is added alongside as `npm run test:unit`.
- Every interactive element must be keyboard reachable with a visible focus ring.

---

### Task 1: Tailwind v4 and the carmine design tokens

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/postcss.config.mjs`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: Tailwind utility classes available app-wide; CSS custom properties `--color-carmine-{50,500,600,700}`, `--color-neutral-{50,200,500,900}`; the `cn()` helper at `@/lib/utils`.

- [ ] **Step 1: Install Tailwind v4 and helpers**

```bash
cd D:/AJAIA/Folium/frontend && npm install tailwindcss @tailwindcss/postcss postcss clsx tailwind-merge
```

Expected: installs without error. Verify the cache landed on D:

```bash
cd D:/AJAIA/Folium/frontend && npm config get cache
```

Expected: `D:\AJAIA\Folium\.npm-cache`. If it prints a `C:` path, stop — `.npmrc` is not being read.

- [ ] **Step 2: Create `frontend/postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

Tailwind v4 has no `tailwind.config.js`. Configuration lives in CSS, which is why the tokens below sit in `globals.css`.

- [ ] **Step 3: Replace `frontend/src/app/globals.css` entirely**

The existing 284 lines style the v1 pages, which are being retired. Replace the whole file:

```css
@import "tailwindcss";

@theme {
  /* Brand. Carmine on white measures about 5.2:1 — passes WCAG AA for
     normal text, fails AAA. It is an accent colour, never body copy. */
  --color-carmine-50: #fdf2f2;
  --color-carmine-500: #d41f26;
  --color-carmine-600: #b01a20;
  --color-carmine-700: #8c1419;

  /* Neutrals are structure, not brand. Without them there is no way to
     express text hierarchy, borders, or disabled states. */
  --color-neutral-50: #fafafa;
  --color-neutral-200: #e4e4e7;
  --color-neutral-500: #71717a;
  --color-neutral-900: #18181b;

  --radius: 0.5rem;
}

@layer base {
  * {
    border-color: var(--color-neutral-200);
  }

  body {
    background-color: var(--color-neutral-50);
    color: var(--color-neutral-900);
    -webkit-font-smoothing: antialiased;
  }

  /* Focus must always be visible. Keyboard users cannot navigate without it. */
  :focus-visible {
    outline: 2px solid var(--color-carmine-500);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: Create `frontend/src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Verify the build compiles**

```bash
cd D:/AJAIA/Folium/frontend && npm run build
```

Expected: "Compiled successfully". The v1 pages will look unstyled now — their CSS was removed. That is expected and temporary; they are retired in 2C.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add Tailwind v4 with the carmine design tokens"
```

---

### Task 2: shadcn/ui components

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/components/ui/*.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `cn()` from `@/lib/utils`, the carmine tokens
- Produces: `Button`, `Input`, `Label`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `Alert` (+ `AlertTitle`, `AlertDescription`), `Separator`, and `Form` primitives, importable from `@/components/ui/<name>`.

- [ ] **Step 1: Initialise shadcn**

```bash
cd D:/AJAIA/Folium/frontend && npx shadcn@latest init -d -y
```

`-d` accepts defaults, `-y` skips confirmation. It creates `components.json`, adds `src/lib/utils.ts` (already present — keep yours if prompted), and appends its CSS variables to `globals.css`.

If it asks about base colour, choose **Neutral**. The carmine tokens from Task 1 stay; shadcn's variables sit alongside them.

- [ ] **Step 2: Add the components the auth pages need**

```bash
cd D:/AJAIA/Folium/frontend && npx shadcn@latest add button input label card alert separator form -y
```

Expected: files appear under `src/components/ui/`. `form` also installs `react-hook-form`, `@hookform/resolvers`, and `zod` peer deps.

- [ ] **Step 3: Point the primary button at carmine**

Open `frontend/src/components/ui/button.tsx`. In the `buttonVariants` definition, replace the `default` and `destructive` variant class strings with:

```ts
        default:
          "bg-carmine-500 text-white shadow hover:bg-carmine-600 active:bg-carmine-700",
        destructive:
          "bg-carmine-700 text-white shadow hover:bg-carmine-700/90",
```

`destructive` is deliberately the *darker* carmine. The brand colour is red, so a destructive action rendered in brand red would look identical to a normal primary button.

- [ ] **Step 4: Verify the components compile**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit
```

Expected: no errors. If shadcn emitted React 19 syntax, adapt it — this project is on React 18.3.

- [ ] **Step 5: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add shadcn/ui components on the carmine palette"
```

---

### Task 3: Supabase browser and server clients

**Files:**
- Create: `frontend/src/lib/supabase/client.ts`
- Create: `frontend/src/lib/supabase/server.ts`
- Create: `frontend/src/lib/supabase/middleware.ts`
- Create: `frontend/.env.local.example`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Produces: `createClient()` from `@/lib/supabase/client` (browser); `createClient()` from `@/lib/supabase/server` (async, server); `updateSession(request)` from `@/lib/supabase/middleware`.

- [ ] **Step 1: Install the Supabase packages**

```bash
cd D:/AJAIA/Folium/frontend && npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create `frontend/.env.local.example`**

```bash
# Copy to .env.local and fill in. .env.local is gitignored.
# Supabase dashboard -> Project Settings -> API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key

# The FastAPI backend.
NEXT_PUBLIC_API_URL=http://localhost:8000

# OAuth buttons are built but hidden until Google and GitHub apps are
# registered in their own consoles and configured in Supabase.
NEXT_PUBLIC_ENABLE_OAUTH=false
```

Only the `anon` key belongs here. It is designed to be public. The `service_role` key must never appear in frontend code — anything with `NEXT_PUBLIC_` is shipped to the browser.

- [ ] **Step 3: Create `frontend/src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for Client Components. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 4: Create `frontend/src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client for Server Components, Route Handlers, and Server Actions.
 *
 * Async because Next 15 made cookies() async. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. Middleware refreshes the
            // session instead, so ignoring this is safe.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: Create `frontend/src/lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh the auth cookie and report who is signed in.
 *
 * Returns the response carrying refreshed cookies. Callers must return that
 * exact object, or the refreshed session is dropped and the user is silently
 * signed out when their token expires. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only reads the
  // cookie, which a client could have forged, so it must not gate access.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 6: Verify it type-checks**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add Supabase browser, server, and middleware clients"
```

---

### Task 4: Typed API client, with Vitest

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/lib/api/errors.ts`
- Create: `frontend/src/lib/api/client.ts`
- Create: `frontend/src/lib/api/client.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client`
- Produces: `ApiError` (with `status: number`, `detail: string`); `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`; `getMe(): Promise<UserProfile>`; type `UserProfile { id: string; email: string; display_name: string; avatar_url: string | null; created_at: string }`.

- [ ] **Step 1: Install the test tooling**

```bash
cd D:/AJAIA/Folium/frontend && npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // The v1 suite under test/ runs on node:test via `npm test`. Excluding it
    // here keeps the two runners from fighting over the same files.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Create `frontend/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add the script to `frontend/package.json`**

In `"scripts"`, add:

```json
    "test:unit": "vitest run",
```

Leave `"test"` exactly as it is. CI runs it against the v1 `node --test` suite, and changing it would break the pipeline.

- [ ] **Step 5: Write the failing tests in `frontend/src/lib/api/client.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession } }),
}));

const { apiFetch } = await import("./client");

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-abc" } },
    });
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  });

  it("attaches the bearer token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await apiFetch("/api/v1/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/me");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc",
    );
  });

  it("reads the token fresh on every call, never caching it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await apiFetch("/a");
    await apiFetch("/b");

    // Tokens expire hourly. A cached one would start returning 401s that look
    // exactly like a backend fault.
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("throws ApiError carrying the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
      }),
    );

    await expect(apiFetch("/api/v1/me")).rejects.toMatchObject({
      status: 401,
      detail: "Not authenticated",
    });
    await expect(apiFetch("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("distinguishes 503 from an auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unavailable" }), { status: 503 }),
    );

    // The backend deliberately separates "keys unavailable" (503) from
    // "not authenticated" (401). Collapsing them would hide an outage.
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 503 });
  });

  it("errors with status 0 when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 0 });
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ email: "a@b.c" }), { status: 200 }),
    );
    await expect(apiFetch<{ email: string }>("/x")).resolves.toEqual({
      email: "a@b.c",
    });
  });

  it("handles a 204 with no body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(apiFetch("/x")).resolves.toBeNull();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./errors` and `./client` do not exist.

- [ ] **Step 7: Create `frontend/src/lib/api/errors.ts`**

```ts
/** An error from the Folium API, carrying the HTTP status.
 *
 * Callers need the status to tell 401 (re-authenticate) from 503 (Supabase key
 * endpoint unreachable) from a genuine 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}
```

- [ ] **Step 8: Create `frontend/src/lib/api/client.ts`**

```ts
import { createClient } from "@/lib/supabase/client";
import { ApiError } from "./errors";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

/** Call the FastAPI backend with the current access token.
 *
 * The token is read on every call rather than cached: Supabase rotates it
 * roughly hourly, and a stale cached token produces 401s indistinguishable
 * from a backend fault. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(0, "Not signed in");
  }

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body. Keep the status text.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export function getMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/me");
}
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: 7 tests PASS.

- [ ] **Step 10: Confirm the v1 suite is untouched**

```bash
cd D:/AJAIA/Folium/frontend && npm test
```

Expected: 14 tests pass, exactly as before.

- [ ] **Step 11: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add typed API client with per-request token reads"
```

---

### Task 5: Auth validation schemas

**Files:**
- Create: `frontend/src/lib/validation/auth.ts`
- Create: `frontend/src/lib/validation/auth.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces: `loginSchema`, `signupSchema`, `magicLinkSchema`, `resetRequestSchema`, `newPasswordSchema`, and their inferred types `LoginValues`, `SignupValues`, `MagicLinkValues`, `ResetRequestValues`, `NewPasswordValues`.

- [ ] **Step 1: Write the failing tests in `frontend/src/lib/validation/auth.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  signupSchema,
} from "./auth";

describe("loginSchema", () => {
  it("accepts a valid pair", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "secret123" }).success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "secret123" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    expect(
      signupSchema.safeParse({ email: "a@b.co", password: "secret123" }).success,
    ).toBe(true);
  });

  it("rejects a password under 8 characters", () => {
    // Supabase's own default minimum. Enforcing it client-side turns a server
    // round-trip into instant feedback.
    expect(signupSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const parsed = signupSchema.parse({ email: "  A@B.CO  ", password: "secret123" });
    expect(parsed.email).toBe("a@b.co");
  });
});

describe("magicLinkSchema", () => {
  it("needs only an email", () => {
    expect(magicLinkSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
  });
});

describe("newPasswordSchema", () => {
  it("requires both fields to match", () => {
    expect(
      newPasswordSchema.safeParse({ password: "secret123", confirm: "secret123" }).success,
    ).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: "secret123", confirm: "different" }).success,
    ).toBe(false);
  });

  it("reports the mismatch on the confirm field", () => {
    const result = newPasswordSchema.safeParse({ password: "secret123", confirm: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Attaching the error to `confirm` puts the message under the field the
      // user must actually change.
      expect(result.error.issues.some((i) => i.path[0] === "confirm")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./auth` does not exist.

- [ ] **Step 3: Create `frontend/src/lib/validation/auth.ts`**

```ts
import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .email("That doesn't look like an email address");

/** Supabase's own default minimum. Checking it here turns a server round-trip
 *  into instant feedback. */
const newPassword = z.string().min(8, "Use at least 8 characters");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const signupSchema = z.object({
  email,
  password: newPassword,
});

export const magicLinkSchema = z.object({ email });

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Those passwords don't match",
    path: ["confirm"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type MagicLinkValues = z.infer<typeof magicLinkSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: all pass (7 from Task 4 plus 9 here).

- [ ] **Step 5: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add zod schemas for the auth forms"
```

---

### Task 6: Auth shell and the login page

**Files:**
- Create: `frontend/src/app/(auth)/layout.tsx`
- Create: `frontend/src/app/(auth)/login/page.tsx`
- Create: `frontend/src/components/auth/LoginForm.tsx`
- Create: `frontend/src/components/auth/AuthMessage.tsx`
- Create: `frontend/src/components/auth/OAuthButtons.tsx`
- Create: `frontend/src/components/auth/LoginForm.test.tsx`
- Delete: `frontend/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `loginSchema`, `magicLinkSchema`, `createClient()` (browser), shadcn `Button`/`Input`/`Label`/`Card`/`Alert`/`Separator`
- Produces: `AuthMessage` with props `{ kind: "error" | "success"; children: React.ReactNode }`; `OAuthButtons` (renders nothing unless `NEXT_PUBLIC_ENABLE_OAUTH === "true"`).

- [ ] **Step 1: Create `frontend/src/app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Folium
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Write and share documents
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/auth/AuthMessage.tsx`**

```tsx
import { cn } from "@/lib/utils";

/** Feedback banner for auth forms.
 *
 * Errors use carmine-700 — darker than the brand carmine-500 — plus an icon
 * and a tinted background. The brand colour is itself red, so colour alone
 * cannot carry the meaning; that also keeps it readable with red-green colour
 * blindness. */
export function AuthMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-2 rounded-md border p-3 text-sm",
        kind === "error"
          ? "border-carmine-500/30 bg-carmine-50 text-carmine-700"
          : "border-neutral-200 bg-white text-neutral-900",
      )}
    >
      <span aria-hidden="true" className="mt-px font-semibold">
        {kind === "error" ? "!" : "✓"}
      </span>
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/auth/OAuthButtons.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

/** Google and GitHub sign-in.
 *
 * Hidden until NEXT_PUBLIC_ENABLE_OAUTH is "true", because both need an app
 * registered in their own console and configured in Supabase before the
 * buttons can do anything. */
export function OAuthButtons() {
  if (process.env.NEXT_PUBLIC_ENABLE_OAUTH !== "true") return null;

  const signIn = async (provider: "google" | "github") => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  };

  return (
    <>
      <div className="my-4 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-neutral-500">or</span>
        <Separator className="flex-1" />
      </div>
      <div className="grid gap-2">
        <Button type="button" variant="outline" onClick={() => signIn("google")}>
          Continue with Google
        </Button>
        <Button type="button" variant="outline" onClick={() => signIn("github")}>
          Continue with GitHub
        </Button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/auth/LoginForm.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, magicLinkSchema, type LoginValues } from "@/lib/validation/auth";

/** Shown for every failed sign-in, whatever the cause.
 *
 * Distinguishing "wrong password" from "no such account" turns the login form
 * into a tool for discovering who has an account here. */
const GENERIC_FAILURE = "Those details didn't match an account.";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setFormError(error.status === 429
        ? "Too many attempts. Wait a minute and try again."
        : GENERIC_FAILURE);
      return;
    }

    router.push(params.get("redirectTo") ?? "/account");
    router.refresh();
  };

  const sendMagicLink = async () => {
    setFormError(null);
    // Validate with the same schema the dedicated form would use, rather than
    // a hand-rolled check that could drift from it.
    const parsed = magicLinkSchema.safeParse({ email: getValues("email") });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    const { email } = parsed.data;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) {
      setFormError(error.status === 429
        ? "Too many requests. Wait a few minutes before asking for another link."
        : "Could not send the link. Try again.");
      return;
    }
    setMagicSent(true);
  };

  if (magicSent) {
    return (
      <AuthMessage kind="success">
        Check your inbox for a sign-in link.
      </AuthMessage>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && <AuthMessage kind="error">{formError}</AuthMessage>}

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-carmine-700">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-carmine-700">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>

        <Button type="button" variant="ghost" onClick={sendMagicLink}>
          Email me a sign-in link instead
        </Button>
      </div>

      <OAuthButtons />

      <div className="mt-6 space-y-2 text-center text-sm text-neutral-500">
        <p>
          <Link href="/reset-password" className="text-carmine-500 hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p>
          No account?{" "}
          <Link href="/signup" className="text-carmine-500 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/(auth)/login/page.tsx`**

```tsx
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sign in — Folium" };

export default function LoginPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        {/* useSearchParams needs a Suspense boundary to prerender. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Delete the v1 login page**

```bash
cd D:/AJAIA/Folium && rm frontend/src/app/login/page.tsx
```

Two files cannot both serve `/login`. The v1 dashboard becomes unreachable from here, which is the accepted trade — 2C rewires it.

- [ ] **Step 7: Write the component tests in `frontend/src/components/auth/LoginForm.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const signInWithPassword = vi.fn();
const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword, signInWithOtp } }),
}));

const { LoginForm } = await import("./LoginForm");

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a validation error for a malformed email", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText(/doesn't look like an email/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("never reveals whether the account exists", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", status: 400 },
    });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/didn't match an account/i);
    // A message naming the email, or saying "no such user", would let a
    // stranger enumerate accounts.
    expect(alert.textContent).not.toMatch(/no account|not found|a@b\.co/i);
  });

  it("redirects on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/account"));
  });

  it("explains a rate limit rather than blaming the credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "rate", status: 429 } });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("confirms when a magic link is sent", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: /sign-in link/i }));

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the tests**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: all pass, including the 5 new ones.

- [ ] **Step 9: Commit**

```bash
cd D:/AJAIA/Folium
git add -A frontend/
git commit -m "feat(frontend): add the auth shell and login page"
```

---

### Task 7: Sign-up, password reset, and the auth callback

**Files:**
- Create: `frontend/src/app/(auth)/signup/page.tsx`
- Create: `frontend/src/app/(auth)/reset-password/page.tsx`
- Create: `frontend/src/app/(auth)/callback/route.ts`
- Create: `frontend/src/components/auth/SignupForm.tsx`
- Create: `frontend/src/components/auth/ResetPasswordForm.tsx`
- Create: `frontend/src/components/auth/SignupForm.test.tsx`

**Interfaces:**
- Consumes: `signupSchema`, `resetRequestSchema`, `newPasswordSchema`, `AuthMessage`, `OAuthButtons`, shadcn primitives
- Produces: routes `/signup`, `/reset-password`, `/callback`

- [ ] **Step 1: Create `frontend/src/components/auth/SignupForm.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupValues } from "@/lib/validation/auth";

export function SignupForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) {
      setFormError(error.status === 429
        ? "Too many sign-up attempts. Wait a few minutes and try again."
        : "Could not create the account. Try again.");
      return;
    }

    // Shown whether or not the address was already registered. Saying "that
    // email is taken" would let a stranger discover who has an account.
    // Supabase notifies the existing owner by email instead.
    setDone(true);
  };

  if (done) {
    return (
      <AuthMessage kind="success">
        Check your inbox to confirm your address, then sign in.
      </AuthMessage>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && <AuthMessage kind="error">{formError}</AuthMessage>}

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-carmine-700">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-carmine-700">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </div>

      <OAuthButtons />

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="text-carmine-500 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/(auth)/signup/page.tsx`**

```tsx
import { SignupForm } from "@/components/auth/SignupForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Create an account — Folium" };

export default function SignupPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <SignupForm />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/auth/ResetPasswordForm.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  newPasswordSchema,
  resetRequestSchema,
  type NewPasswordValues,
  type ResetRequestValues,
} from "@/lib/validation/auth";

/** One component, two modes.
 *
 * Arriving from a reset email leaves an active recovery session, so the form
 * asks for a new password. Otherwise it asks where to send the link. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session);
    });
  }, []);

  const requestForm = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
  });
  const updateForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
  });

  const requestLink = async (values: ResetRequestValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error && error.status === 429) {
      setFormError("Too many requests. Wait a few minutes and try again.");
      return;
    }
    // Always report success, even on failure: confirming which addresses are
    // registered would leak the user list.
    setSent(true);
  };

  const updatePassword = async (values: NewPasswordValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError("Could not update the password. Request a new link.");
      return;
    }
    router.push("/account");
    router.refresh();
  };

  if (sent) {
    return (
      <AuthMessage kind="success">
        If that address has an account, a reset link is on its way.
      </AuthMessage>
    );
  }

  if (hasRecoverySession) {
    return (
      <form onSubmit={updateForm.handleSubmit(updatePassword)} noValidate>
        {formError && <AuthMessage kind="error">{formError}</AuthMessage>}
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!updateForm.formState.errors.password}
              {...updateForm.register("password")}
            />
            {updateForm.formState.errors.password && (
              <p className="text-sm text-carmine-700">
                {updateForm.formState.errors.password.message}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!updateForm.formState.errors.confirm}
              {...updateForm.register("confirm")}
            />
            {updateForm.formState.errors.confirm && (
              <p className="text-sm text-carmine-700">
                {updateForm.formState.errors.confirm.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={updateForm.formState.isSubmitting}>
            {updateForm.formState.isSubmitting ? "Saving…" : "Set new password"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestForm.handleSubmit(requestLink)} noValidate>
      {formError && <AuthMessage kind="error">{formError}</AuthMessage>}
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!requestForm.formState.errors.email}
            {...requestForm.register("email")}
          />
          {requestForm.formState.errors.email && (
            <p className="text-sm text-carmine-700">
              {requestForm.formState.errors.email.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={requestForm.formState.isSubmitting}>
          {requestForm.formState.isSubmitting ? "Sending…" : "Email me a reset link"}
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-neutral-500">
        <Link href="/login" className="text-carmine-500 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/(auth)/reset-password/page.tsx`**

```tsx
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Reset your password — Folium" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/(auth)/callback/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Where Supabase sends the browser after an email link.
 *
 * The link carries a one-time code that must be exchanged for a session
 * cookie. Without this route, magic links and confirmation emails land on a
 * page with no session and appear to have silently failed. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}
```

- [ ] **Step 6: Write the tests in `frontend/src/components/auth/SignupForm.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
}));

const { SignupForm } = await import("./SignupForm");

describe("SignupForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a password under 8 characters before calling Supabase", async () => {
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the same confirmation for an address that already exists", async () => {
    // Supabase returns success for a duplicate address and emails the existing
    // owner. Surfacing "already registered" would leak the user list.
    signUp.mockResolvedValue({ error: null });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "taken@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const message = await screen.findByText(/check your inbox/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/already|exists|taken/i);
  });

  it("explains a rate limit clearly", async () => {
    signUp.mockResolvedValue({ error: { message: "rate", status: 429 } });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many sign-up/i);
  });
});
```

- [ ] **Step 7: Run the tests**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: all pass, including the 3 new ones.

- [ ] **Step 8: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add sign-up, password reset, and the auth callback"
```

---

### Task 8: Middleware guard and the account page

**Files:**
- Create: `frontend/middleware.ts`
- Create: `frontend/src/app/(app)/layout.tsx`
- Create: `frontend/src/app/(app)/account/page.tsx`
- Create: `frontend/src/components/auth/SignOutButton.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `updateSession()` from `@/lib/supabase/middleware`, `createClient()` (server), `getMe()`
- Produces: the `/account` route; `/` redirecting by auth state

This task delivers the milestone: `/account` proves the browser, Supabase, and FastAPI all agree on who the user is.

- [ ] **Step 1: Create `frontend/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/account"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Send them back where they were headed once they sign in.
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Must return the response from updateSession: it carries the refreshed
  // auth cookies. Returning a fresh NextResponse drops them and signs the
  // user out as soon as their token rotates.
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images).*)"],
};
```

- [ ] **Step 2: Create `frontend/src/components/auth/SignOutButton.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button variant="ghost" onClick={signOut}>
      Sign out
    </Button>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/(app)/layout.tsx`**

```tsx
import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/account" className="font-semibold text-neutral-900">
            Folium
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/(app)/account/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/errors";
import { getMe, type UserProfile } from "@/lib/api/client";

export default function AccountPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 503) {
          // 2A deliberately separates this from a 401 so an outage is not
          // mistaken for everyone's credentials failing at once.
          setError("Sign-in is temporarily unavailable. Try again shortly.");
        } else if (err instanceof ApiError && err.status === 401) {
          setError("Your session has expired. Sign in again.");
        } else {
          setError("Could not load your profile.");
        }
      });
  }, []);

  if (error) return <AuthMessage kind="error">{error}</AuthMessage>;
  if (!profile) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.display_name}</CardTitle>
        <CardDescription>{profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Account ID</dt>
            <dd className="font-mono text-neutral-900">{profile.id}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Joined</dt>
            <dd className="text-neutral-900">
              {new Date(profile.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-sm text-neutral-500">
          This profile was loaded from the Folium API, which verified your
          Supabase token before answering.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Replace `frontend/src/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/account" : "/login");
}
```

- [ ] **Step 6: Type-check and build**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit && npm run build
```

Expected: no type errors, "Compiled successfully".

- [ ] **Step 7: Run the unit suite**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): guard the app routes and add the account page"
```

---

### Task 9: Playwright end-to-end, with browsers on D:

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/auth.spec.ts`
- Modify: `frontend/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the running frontend and backend
- Produces: `npm run e2e` and `npm run e2e:install`

- [ ] **Step 1: Install Playwright with its browsers on D:**

```bash
cd D:/AJAIA/Folium/frontend && npm install -D @playwright/test cross-env
```

```bash
cd D:/AJAIA/Folium/frontend && npx cross-env PLAYWRIGHT_BROWSERS_PATH=D:/AJAIA/Folium/.playwright-browsers npx playwright install chromium
```

- [ ] **Step 2: Verify nothing landed on C:**

```bash
ls "D:/AJAIA/Folium/.playwright-browsers"
```

Expected: a `chromium-*` directory. If `C:/Users/hp/AppData/Local/ms-playwright` gained a new entry instead, the environment variable did not apply — stop and fix it rather than continuing.

- [ ] **Step 3: Add the scripts to `frontend/package.json`**

In `"scripts"`, add:

```json
    "e2e": "cross-env PLAYWRIGHT_BROWSERS_PATH=D:/AJAIA/Folium/.playwright-browsers playwright test",
    "e2e:install": "cross-env PLAYWRIGHT_BROWSERS_PATH=D:/AJAIA/Folium/.playwright-browsers playwright install chromium"
```

Setting the variable inside the scripts keeps the browsers off `C:` without depending on a machine-wide environment variable that a fresh shell or another machine would not have.

- [ ] **Step 4: Create `frontend/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Each test creates a real account in a shared database. Running them in
  // parallel makes failures hard to attribute, and the payoff is seconds.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: Create `frontend/e2e/auth.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

/** A fresh address per run.
 *
 * The backend suite learned this the hard way in 2A: fixed addresses pass once
 * against a clean database and then collide forever. `@example.com` is also
 * what backend/scripts/clean_test_data.py matches, so these accounts are
 * removable afterwards. */
function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

test("signed-out visitors cannot reach the account page", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  // The guard must run before any protected markup renders.
  await expect(page.getByText(/account id/i)).toHaveCount(0);
});

test("the login form never reveals whether an account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("definitely-not-registered@example.com");
  await page.getByLabel(/password/i).fill("whatever123");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/no account|not found/i);
});

test("sign up, sign in, see the profile from the API, sign out", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/account/);
  // This is the milestone: the address came back from FastAPI, which verified
  // the Supabase token and provisioned the user row before answering.
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/account id/i)).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("a guarded page returns you where you were headed", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/redirectTo=%2Faccount/);
});
```

- [ ] **Step 6: Run the suite**

Start the backend first, in a separate terminal:

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Then:

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Expected: 4 tests pass. Playwright starts the dev server itself.

**If the sign-up test fails because the account cannot sign in**, email confirmation is still enabled in Supabase. Turn it off under *Authentication → Sign In / Providers → Email → Confirm email*, then re-run. Do not work around it by weakening the test.

- [ ] **Step 7: Run it a second time to prove it is idempotent**

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Expected: 4 tests pass again. A failure here means an address is being reused across runs.

- [ ] **Step 8: Document it in `README.md`**

Insert immediately before the "### Authentication" heading:

````markdown
### End-to-end tests

Playwright covers sign-up, sign-in, the route guard, and sign-out against a real Supabase project.
It runs locally only — CI holds no Supabase credentials, and adding them would mean putting a
database password into GitHub secrets and letting every run create accounts.

```bash
cd frontend && npm run e2e:install
```

```bash
cd frontend && npm run e2e
```

Browsers download to `D:\AJAIA\Folium\.playwright-browsers`, not the system drive.

Two prerequisites, both in the Supabase dashboard:

- **Email confirmation must be off** (*Authentication → Sign In / Providers → Email*), or a new
  account cannot sign in until a link in a real inbox is clicked. Re-enable before launch.
- Free-tier email is rate-limited, which is why the tests use password sign-up rather than magic
  links.

Each run creates a real account. Clear them with `backend/scripts/clean_test_data.py`.
````

- [ ] **Step 9: Commit**

```bash
cd D:/AJAIA/Folium
git add -A frontend/ README.md
git commit -m "test(frontend): add Playwright auth flow with browsers on D:"
```

---

## Definition of done

- [ ] A new account can be created; the user row is provisioned from the token claims
- [ ] Password sign-in reaches `/account`, showing the profile from `GET /api/v1/me`
- [ ] Magic-link sign-in completes through `/callback`
- [ ] `/account` while signed out redirects to `/login` with no protected content rendered first
- [ ] Signing in from a guarded page returns to the originally requested page
- [ ] A failed login never reveals whether the email exists
- [ ] Signing out clears the session; `/account` is unreachable afterwards
- [ ] Every interactive element is keyboard reachable with a visible focus ring
- [ ] `npm run build`, `npx tsc --noEmit`, `npm test`, and `npm run test:unit` all pass
- [ ] `npm run e2e` passes twice in a row
- [ ] Playwright browsers are under `D:\AJAIA\Folium\.playwright-browsers`; nothing added to `%LOCALAPPDATA%`
- [ ] No files under `backend/` changed

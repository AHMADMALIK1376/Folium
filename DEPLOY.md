# Deployment Guide

This covers deployment for both versions. **v2 is designed but not yet implemented** — its section
describes the target setup and is not yet runnable.

---

# Part 1 — v2 deployment (target)

## Topology

| Component | Platform | Notes |
|---|---|---|
| Frontend (Next.js) | Vercel | Root directory set to `frontend/` |
| Backend (FastAPI) | Render or Fly.io | Root directory set to `backend/` |
| Database + Auth | Supabase | PostgreSQL, Auth, and Storage in one project |
| Real-time collab | Managed service | Chosen in Phase 4 |

Both applications live in one repository and deploy independently. Vercel and Render both support
targeting a subdirectory, which is what makes this work.

> **Verify free-tier limits before committing.** Free tiers and inactivity-pause policies change
> frequently, so no specific quotas are recorded here. Check each provider's current pricing page.

## Order of setup

Set up Supabase first — both other services need its credentials.

### 1. Supabase

1. Create a project at https://supabase.com.
2. From **Project Settings → API**, record:
   - Project URL
   - `anon` public key — safe for the browser
   - `service_role` key — **server-side only, never expose this to the frontend**
3. From **Project Settings → Database**, record the connection string for Alembic and SQLAlchemy.
4. Under **Authentication → Providers**, enable email/password and any OAuth providers you want.
5. Under **Authentication → URL Configuration**, add your frontend URLs (local and production) as
   redirect URLs.

### 2. Backend (Render)

1. **New → Web Service**, connect the repository.
2. Set **Root Directory** to `backend`.
3. Configure:
   - **Runtime:** Python 3.12+
   - **Build command:** `pip install -e .`
   - **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:

   ```
   DATABASE_URL=<Supabase connection string>
   SUPABASE_URL=<project URL>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   SUPABASE_JWT_ISSUER=<project URL>/auth/v1
   FRONTEND_ORIGIN=<your Vercel URL>
   ```

5. Run migrations once the service is up: `alembic upgrade head`.

**Free-tier caveat:** free instances sleep after inactivity, so the first request after idle can take
30–60 seconds. This is tolerable for REST traffic and is exactly why real-time collaboration is
handled by a separate always-on managed service rather than by this process.

### 3. Frontend (Vercel)

1. **Add New → Project**, import the repository.
2. Set **Root Directory** to `frontend`.
3. Framework preset: Next.js (auto-detected).
4. Environment variables:

   ```
   NEXT_PUBLIC_SUPABASE_URL=<project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   NEXT_PUBLIC_API_URL=<your Render backend URL>
   ```

   Only `NEXT_PUBLIC_`-prefixed variables reach the browser. The `service_role` key must **never**
   appear here.

5. Deploy, then add the resulting URL to `FRONTEND_ORIGIN` on the backend and to Supabase's redirect
   URL list.

### 4. CORS

The backend must allow the frontend origin explicitly. Configure `CORSMiddleware` in `app/main.py`
from the `FRONTEND_ORIGIN` variable — allow credentials, and do not use a wildcard origin in
production.

## Verifying a v2 deployment

1. Open the frontend URL — the marketing page should load.
2. Sign up with a real email; confirm the verification email arrives.
3. Log in, create a document, type, and refresh — content persists.
4. Share it with a second account; confirm that account sees it under documents shared with them.
5. Sign in as a third account and request the document id directly — expect **404**, not 403.
6. Open the same document in two browsers and confirm live cursors (Phase 4 onward).

Step 5 is the important one: it is the test that protects real users' private documents.

---

# Part 2 — v1 deployment (current code)

## Why not Vercel

v1 persists documents to a local SQLite file (`frontend/data/app.sqlite`) via `node:sqlite`. That requires a
**long-running process with a writable, persistent local disk**. Vercel's default model runs Next.js
API routes as ephemeral serverless functions with no shared filesystem across invocations, so a local
SQLite file would not reliably survive between requests.

This constraint is specific to v1's storage choice and **disappears in v2**, where Postgres is a
network service.

## Option A: Railway

1. Push the project to a GitHub repository.
2. https://railway.app → **New Project** → **Deploy from GitHub repo** → select the repo.
3. Set the service's **Root Directory** to `frontend`, so Railway builds and runs the Next.js app
   instead of the repo root (Part 1 does the same for the v2 services).
4. Railway auto-detects Node. No environment variables are required.
5. Under **Settings**, confirm:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Node version:** 22.x — Railway reads `engines.node` from `package.json`, already set to
     `>=22.5.0`. Set it explicitly under Settings → Environment if it isn't picked up.
6. Deploy. Railway provisions a persistent disk by default, surviving restarts within the same
   deployment. A fresh deploy resets `frontend/data/`, which is expected for a demo — the app
   auto-seeds.
7. Open the generated `*.up.railway.app` URL.

## Option B: Render

1. Push the project to a GitHub repository.
2. https://render.com → **New** → **Web Service** → connect the repo.
3. Set **Root Directory** to `frontend`, so build and start commands run inside the Next.js app
   (Part 1 does the same for the v2 services).
4. Configure:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Node version:** set `NODE_VERSION=22.5.0` or newer, or rely on `engines` in `package.json`.
5. On the free tier the local disk persists only for the lifetime of the running instance — a redeploy
   or a spin-down resets `frontend/data/app.sqlite`, and the app re-seeds on next boot. For persistence
   across redeploys, attach a **Render Disk** (paid) mounted at `/opt/render/project/src/frontend/data`.
6. Deploy and open the generated `*.onrender.com` URL.

## Verifying a v1 deployment

1. Open the URL — the login screen with three seeded accounts should appear.
2. Log in as Alice; confirm the "Welcome to Folium" document is visible.
3. Create a document, type, refresh — content should persist.
4. Share with `bob@example.com`, log in as Bob, confirm it appears under "Shared with Me".
5. Upload a `.md` file and confirm the conversion applied formatting.

If a step fails, check the platform's build and runtime logs first. The most common issue is a Node
version older than 22.5, which `node:sqlite` requires.

## Local Docker alternative

Any host that can run a persistent Node 22+ container works. Build from the repo root, copying from
`frontend/` so the image only contains the Next.js app:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Mount a volume at `/app/data` to persist the SQLite file across container restarts.

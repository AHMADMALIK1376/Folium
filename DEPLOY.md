# Deployment Guide

## Why not Vercel

This app persists documents to a local SQLite file (`data/app.sqlite`) via Node's built-in `node:sqlite` module. That requires a **long-running process with a writable, persistent local disk**. Vercel's default deployment model runs Next.js API routes as ephemeral serverless functions with no shared/persistent filesystem across invocations — a local SQLite file would not reliably survive between requests there. This is a deliberate infrastructure call-out, not an oversight (see `ARCHITECTURE.md`).

Instead, deploy to a platform that runs the app as a normal persistent Node process. **Railway** and **Render** both work well and have free tiers. Steps for both below — pick one.

## Option A: Railway

1. Push this project to a GitHub repo.
2. Go to https://railway.app → **New Project** → **Deploy from GitHub repo** → select the repo.
3. Railway auto-detects Node. Under **Settings → Variables**, no environment variables are required.
4. Under **Settings**, confirm:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Node version:** 22.x (Railway reads `engines.node` from `package.json`, already set to `>=22.5.0`; if it doesn't pick it up automatically, set it explicitly under Settings → Environment.)
5. Deploy. Railway provisions a persistent disk for the service by default (survives restarts within the same deployment; a fresh deploy from a new build will reset `data/`, which is expected for a demo — the app auto-seeds on first run).
6. Once deployed, open the generated `*.up.railway.app` URL — you should land on the login screen.

## Option B: Render

1. Push this project to a GitHub repo.
2. Go to https://render.com → **New** → **Web Service** → connect the repo.
3. Configure:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Node version:** set `NODE_VERSION=22.5.0` (or newer) under Environment, or rely on the `engines` field in `package.json`.
4. Free tier: the service's local disk persists for the lifetime of the running instance but is **not** a durable/attached volume — on Render's free tier, a redeploy or the instance spinning down after inactivity will reset `data/app.sqlite`, and the app will simply re-seed on next boot. For persistence across redeploys, attach a **Render Disk** (paid) mounted at `/opt/render/project/src/data`.
5. Deploy and open the generated `*.onrender.com` URL.

## Verifying the deployment

Once live:
1. Open the URL — you should see the login screen with three seeded accounts.
2. Log in as Alice, confirm you see the "Welcome to Folium" document.
3. Create a new document, type something, refresh the page — content should still be there (confirms persistence).
4. Share it with `bob@example.com`, then log out and log back in as Bob — confirm it shows under "Shared with Me".
5. Upload a `.md` file from the dashboard — confirm it creates a new document with formatting applied.

If any step fails, check the platform's build/runtime logs first — the most common issue is the Node version being too old for `node:sqlite` (needs >= 22.5).

## Local Docker alternative (optional)

If you'd rather not use Railway/Render, any host that can run a persistent Node 22+ container works — e.g., `Dockerfile`:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Mount a volume at `/app/data` to persist the SQLite file across container restarts.

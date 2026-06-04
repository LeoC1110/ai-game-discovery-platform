# Railway Deployment Plan

Monorepo: `ai-game-discovery-platform`  
Builder: **Railpack** (no Dockerfile — repo has zero Dockerfile/nixpacks/Procfile)  
Phase 1: **Frontend only** — backend services deployed separately later.  
Goal: Both frontend Public Domains open without 502.

---

## Pre-flight Checklist (already verified ✅)

| Item | Status |
|------|--------|
| `apps/progress-frontend` has `build: vite build` | ✅ |
| `apps/progress-frontend` has `start: serve dist -s -l $PORT` | ✅ |
| `apps/progress-frontend` has `serve` in `dependencies` | ✅ `^14.2.4` |
| `apps/auth-frontend` has `build: vite build` | ✅ |
| `apps/auth-frontend` has `start: serve dist -s -l $PORT` | ✅ |
| `apps/auth-frontend` has `serve` in `dependencies` | ✅ `^14.2.4` |
| No Dockerfile / nixpacks.toml / Procfile in repo | ✅ |
| `package-lock.json` is in sync | ✅ |

---

## Phase 1 — Deploy progress-frontend FIRST

> Deploy and verify this one before touching auth-frontend.

### Step 1 — Create new Railway service

1. Railway project → **New Service** → **GitHub Repo**
2. Select `LeoC1110/ai-game-discovery-platform`
3. Railway will show a settings panel — configure BEFORE first deploy:

### Step 2 — Service settings

| Setting | Value |
|---------|-------|
| **Builder** | `Railpack` |
| **Root Directory** | *(leave empty)* |
| **Build Command** | `npm ci && npm run build --workspace @apps/progress-frontend` |
| **Start Command** | `npm run start --workspace @apps/progress-frontend` |
| **Watch Paths** | `/apps/progress-frontend/**` |

### Step 3 — Networking

1. After service is created → **Settings → Networking → Public Networking**
2. Click **Generate Domain**
3. **Target Port**: Leave blank initially
4. After first successful deploy, check Deploy Logs for the line:
   ```
   INFO  Accepting connections at http://localhost:XXXX
   ```
   Set Target Port to that `XXXX` value if Railway doesn't auto-detect.

### Step 4 — Environment Variables

None required for frontend-only deploy. Do NOT add MONGODB_URI, JWT_SECRET, or GOOGLE_API_KEY to frontend services.

### Step 5 — Deploy and verify

**Build Logs should show:**
```
npm ci          ← installs all workspace dependencies
vite build      ← compiles progress-frontend to dist/
```

**Deploy Logs should show:**
```
> @apps/progress-frontend@1.0.0 start
> serve dist -s -l $PORT
INFO  Accepting connections at http://localhost:PORT
```

**Service status:** `Active` (green dot)

**Public Domain:** Opens the React app (may show blank/error UI — that's OK, backend not connected yet)

---

## Phase 2 — Deploy auth-frontend (after progress-frontend is confirmed working)

Same steps as Phase 1, replacing `progress-frontend` with `auth-frontend`:

| Setting | Value |
|---------|-------|
| **Builder** | `Railpack` |
| **Root Directory** | *(leave empty)* |
| **Build Command** | `npm ci && npm run build --workspace @apps/auth-frontend` |
| **Start Command** | `npm run start --workspace @apps/auth-frontend` |
| **Watch Paths** | `/apps/auth-frontend/**` |

---

## Troubleshooting — If still 502 after correct setup

Check in this exact order:

1. **Builder is Railpack?**
   Settings → Build → Builder must show `Railpack`, not `Dockerfile`.

2. **Start Command correct?**
   Must be `npm run start --workspace @apps/progress-frontend`.
   Must NOT be `npm run dev`, `vite`, or `vite preview`.

3. **Root Directory is empty?**
   Do NOT set it to `apps/progress-frontend`. Leave blank.

4. **dist was built?**
   In Build Logs, search for `vite v` — should see Vite build output and file sizes.
   If missing, the build failed silently — check for errors above.

5. **Target Port mismatch?**
   In Deploy Logs, find the exact port number after `Accepting connections at http://localhost:`.
   Go to Settings → Networking → Target Port → set that exact number → Save → Redeploy.

6. **serve not found?**
   If Deploy Logs show `serve: command not found`, check that `serve` is in `dependencies`
   (not `devDependencies`) in `apps/progress-frontend/package.json`.

---

## Phase 3 — Backend (later, separate task)

Deployment order when ready:

```
1. auth-service    → Railway service, needs MONGODB_URI + JWT_SECRET + GOOGLE_API_KEY
                   → get deployed URL

2. Set env vars on frontends:
   auth-frontend:     VITE_GRAPHQL_URI = https://<auth-service>.up.railway.app/graphql
   progress-frontend: VITE_GRAPHQL_URI = https://<auth-service>.up.railway.app/graphql
                      VITE_AUTH_REMOTE_URL = https://<auth-frontend>.up.railway.app/assets/remoteEntry.js

3. progress-service → Railway service, needs MONGODB_URI + JWT_SECRET
```

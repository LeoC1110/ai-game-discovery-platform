# Railway Deployment Plan

Monorepo: `ai-game-discovery-platform`  
Builder: **Railpack** (no Dockerfile)  
Phase: Frontend only — backend services deployed separately later.

---

## Service 1 — auth-frontend

| Setting | Value |
|---------|-------|
| **Source Repo** | `LeoC1110/ai-game-discovery-platform` |
| **Builder** | Railpack |
| **Root Directory** | *(leave empty — repo root)* |
| **Build Command** | `npm ci && npm run build --workspace @apps/auth-frontend` |
| **Start Command** | `npm run start --workspace @apps/auth-frontend` |
| **Watch Paths** | `apps/auth-frontend/**` |
| **Public Networking → Generate Domain** | yes |
| **Target Port** | Leave blank — Railway will auto-detect from `serve` output |

**Environment Variables (none required for frontend-only deploy):**  
Add these later when connecting to backend:
```
VITE_GRAPHQL_URI=https://<auth-service>.up.railway.app/graphql
```

---

## Service 2 — progress-frontend

| Setting | Value |
|---------|-------|
| **Source Repo** | `LeoC1110/ai-game-discovery-platform` |
| **Builder** | Railpack |
| **Root Directory** | *(leave empty — repo root)* |
| **Build Command** | `npm ci && npm run build --workspace @apps/progress-frontend` |
| **Start Command** | `npm run start --workspace @apps/progress-frontend` |
| **Watch Paths** | `apps/progress-frontend/**` |
| **Public Networking → Generate Domain** | yes |
| **Target Port** | Leave blank — Railway will auto-detect from `serve` output |

**Environment Variables (none required for frontend-only deploy):**  
Add these later when connecting to backend:
```
VITE_GRAPHQL_URI=https://<auth-service>.up.railway.app/graphql
VITE_AUTH_REMOTE_URL=https://<auth-frontend>.up.railway.app/assets/remoteEntry.js
```

---

## Deployment Verification Checklist

### Build Logs — expected output
```
✓ npm ci          (installs all workspace deps)
✓ vite build      (outputs apps/*/dist/)
```

### Deploy Logs — expected output
```
INFO  Accepting connections at http://localhost:<PORT>
```
or
```
Listening on port <PORT>
```

### If still 502 after deploy — check in order

1. **Start Command** — must be `npm run start --workspace @apps/<name>`
2. **Builder** — must be **Railpack**, not Dockerfile
3. **Root Directory** — must be empty (not `apps/auth-frontend`)
4. **Target Port** — in Railway → service → Settings → Networking, check what port
   Railway is proxying to. It must match the port `serve` is listening on.
   `serve` reads `$PORT` from Railway's environment — if auto-detect fails,
   manually set Target Port to `3000`.
5. **dist exists** — check Build Logs for `vite build` success and `dist/` output

### If Target Port is wrong
In Railway → service → Settings → **Public Networking → Target Port**:  
Set to the port shown in Deploy Logs after `Accepting connections at`.

---

## Deployment Order (full stack — later)

```
1. auth-service    → get URL → set as VITE_GRAPHQL_URI
2. auth-frontend   → get URL → set as VITE_AUTH_REMOTE_URL in progress-frontend
3. progress-service
4. progress-frontend
```

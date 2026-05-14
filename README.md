# Micro-frontend Game Suite

This repository now houses a multi-service workspace with separate authentication and player progress domains, plus two Vite micro-frontends.

## Package map

```
packages/
  auth-service       # GraphQL auth service (port 4001)
  progress-service   # GraphQL progress service (port 4002)
apps/
  auth-frontend        # Login/registration MFE (port 5173)
  progress-frontend    # Progress/leaderboard MFE (port 5174)
shared/
  jwt                # Shared JWT helper used by both services
```

Each package has its own `.env` with sensible defaults. Adjust `MONGO_URI` / `JWT_SECRET` as needed.

## Install dependencies

```powershell
npm install
```

This installs all workspace dependencies (services, frontends, shared module).

## Development workflow

1. Start MongoDB (default URI `mongodb://localhost:27017`).
2. Run the auth GraphQL service.
   ```powershell
   npm run dev:auth
   ```
3. Run the progress GraphQL service.
   ```powershell
   npm run dev:progress
   ```
4. Start the auth micro-frontend.
   ```powershell
   npm run dev:auth-frontend
   ```
5. Start the progress micro-frontend.
   ```powershell
   npm run dev:progress-frontend
   ```
6. Register through the auth front-end (`http://localhost:5173`). Login will store the JWT (localStorage + cookie) and redirect to the progress front-end at `http://localhost:5174`.
7. Use the progress UI to track experience, unlock achievements, and check leaderboards.

Module federation links the two front-ends: `auth-frontend` exposes a reusable `UserBadge` component that `progress-frontend` consumes to render the logged-in avatar.

## Useful scripts

- `npm run dev:auth` – nodemon dev server for auth service.
- `npm run dev:progress` – nodemon dev server for progress service.
- `npm run dev:auth-frontend` – Vite dev server (port 5173).
- `npm run dev:progress-frontend` – Vite dev server (port 5174).

## Notes

- Both services read the same `JWT_SECRET` via their `.env` files and rely on the shared `@shared/jwt` helpers for signing/verifying tokens.
- Front-ends default to the local GraphQL endpoints but accept `VITE_GRAPHQL_URI`, `VITE_PROGRESS_APP_URL`, and `VITE_AUTH_APP_URL` overrides.
- Ensure the auth front-end stays running so the progress front-end can load the federated `UserBadge` remote (`remoteEntry.js`).

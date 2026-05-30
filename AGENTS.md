# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout

- `main` currently contains only the root `README.md` (placeholder repo title).
- The runnable **Stock Signal Dashboard** (React + Vite + Express) lives on branch `cursor/stock-tracker-website-f35a`. Check out that branch (or a descendant) before installing dependencies or running the app:

```bash
git fetch origin cursor/stock-tracker-website-f35a
git checkout cursor/stock-tracker-website-f35a
```

### Services

| Service | Port | Start |
|---------|------|--------|
| Vite dev server (UI + `/api` proxy) | 5173 | `npm run dev:client` or `npm run dev` |
| Express API | 3001 | `npm run dev:server` or `npm run dev` |

Use `npm run dev` for normal development; it runs both processes via `concurrently`. Prefer a **tmux** session for long-running dev servers in Cloud Agent VMs.

### Standard commands

See `README.md` on the stock-tracker branch:

- **Install:** `npm install`
- **Dev:** `npm run dev` → open `http://localhost:5173`
- **Build / validate:** `npm run check` (runs `vite build`)
- **Production API only:** `npm run build` then `npm start` (serves API on `PORT` / 3001; no static file server in `server/index.js`)

There is **no ESLint** or automated test suite in `package.json`; `npm test` is a stub and exits with code 1.

### External dependencies

- **Yahoo Finance** (`query1.finance.yahoo.com`): required for quotes and news; the API process needs outbound HTTPS.
- **Twilio** (optional): set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` for real SMS. Without them, notification endpoints still work in dry-run mode (logged to the server console).

### Gotchas

- Vite proxies `/api` to `http://localhost:3001`; the API must be running for the UI to load stock data.
- Alert deduplication state is an in-memory `Map` on the API server (resets on restart).
- Watchlist and alert settings persist in browser `localStorage`, not on the server.

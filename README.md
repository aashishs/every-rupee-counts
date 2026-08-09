# Every Rupee Counts

Personal finance tracker PWA — expenses, income, investments, assets, cash flow, budgets, recurring payments, and encrypted offline-first sync.

**Stack:** React + Vite + Tailwind · Node.js + Express · PostgreSQL · JWT · IndexedDB + AES sync · Service Worker PWA

## Quick start

### 1. Start Postgres

```bash
docker compose up db -d
```

Or use any local Postgres and set `DATABASE_URL` in `server/.env`.

### 2. Install & run API

```bash
cd server
npm install
cp .env.example .env   # if needed
npm run dev
```

API: `http://localhost:5000` · Health: `GET /api/health`

Migrations run automatically on server start.

### 3. Run the web app

```bash
cd client
npm install
npm run dev
```

App: `http://localhost:5173` (proxies `/api` to the backend)

### Root scripts (optional)

```bash
npm install
npm run dev          # API + client together
npm run docker:up    # full stack via Docker
```

## Features

| Module | Capabilities |
| --- | --- |
| Dashboard | Balance, income/expense, net worth, health score, charts, upcoming payments |
| Transactions | Expense & income CRUD, categories, tags, notes, search/filter, offline fallback |
| Investments | Portfolio CRUD, live value updates, gain/loss, allocation chart, history |
| Assets | Physical/digital assets with appreciation tracking |
| Cash flow | Weekly / monthly / yearly income vs expense trends |
| Budgets | Category budgets, utilization alerts, trend-based recommendations |
| Recurring | Daily→yearly schedules, skip/pause, enter-now, reminders |
| Reports | Custom date ranges with breakdown charts |
| Notifications | Budget warnings & recurring payment reminders |
| PWA | Installable, offline shell, background-friendly sync hooks |
| Security | JWT, bcrypt, rate limits, helmet, encrypted sync blobs |

## Offline & sync

1. Data is written to **IndexedDB** for offline use.
2. On reconnect (or daily / manual Sync), a full snapshot is **AES-encrypted** client-side.
3. The API stores encrypted blobs; conflict resolution uses **last-write-wins** by `updated_at` / version.
4. Pull → merge → push keeps cloud and device aligned.

## Environment

**Server (`server/.env`)**

- `DATABASE_URL` – Postgres connection string
- `JWT_SECRET` – change in production
- `CLIENT_URL` – CORS origin (default `http://localhost:5173`)
- `PORT` – default `5000`

**Client (`client/.env`)**

- `VITE_API_URL` – default `/api` (dev proxy) or absolute API URL in production

## Docker

```bash
docker compose up --build
```

- Web: `http://localhost:4173`
- API: `http://localhost:5000`
- Postgres: `localhost:5432`

## Project layout

```
every-rupee-counts/
  client/          React PWA (Vite + Tailwind + Recharts)
  server/          Express REST API + Postgres
  docker-compose.yml
```

## Production notes

- Set a strong `JWT_SECRET` and use HTTPS.
- Prefer managed Postgres and reverse-proxy the API.
- Replace demo notification permission with Web Push VAPID keys when you enable push serverside.
- Receipt uploads can be wired to `multer` + object storage on the transactions route.

---

**Every Rupee Counts** — because the small amounts add up.

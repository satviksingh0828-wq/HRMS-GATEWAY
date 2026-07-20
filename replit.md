# Attendance Gateway

A TanStack Start (React SSR) + Supabase attendance management API. Built originally on Lovable, now deployed on Vercel.

## Stack

- **Framework**: TanStack Start v1 (React 19, SSR via Nitro)
- **Database**: Supabase (PostgreSQL, service-role client — bypasses RLS)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Package manager**: Bun
- **Deployment target**: Vercel (`nitro` preset)

## Environment variables

All three are required at runtime — the server throws on startup if any are missing.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only, bypasses RLS) |
| `PANEL_KEY` | Secret key sent by the panel app in the `x-panel-key` header |

Copy `.env.example` → `.env` and fill in your values for local development.

## API endpoints

All under `/api/public/`:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/public/departments` | `x-panel-key` | List all departments with device credentials |
| `POST` | `/api/public/sync` | `x-panel-key` | Sync full employee + department roster |
| `POST` | `/api/public/panel-logs` | `x-panel-key` | Fetch attendance logs (last 3 days) |
| `POST` | `/api/public/dept-code` | device_id + device_password | Get/rotate rotating 10-digit department code |
| `POST` | `/api/public/employee` | none | Look up employee by number |
| `POST` | `/api/public/add-face-data` | none | Store face data for an employee (immutable once set) |
| `POST` | `/api/public/attendance` | department_code | Log check-in / check-out |

## Database setup

Run these SQL files in the Supabase SQL editor (in order):

1. `supabase-schema.sql`
2. `supabase-schema-addendum.sql`
3. `supabase-schema-facial-verification.sql`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo in [Vercel](https://vercel.com/new).
3. Set the three environment variables above in the Vercel project settings.
4. Vercel will auto-detect `vercel.json` and run `bun run build` — output goes to `.vercel/output`.

## Local development

```bash
bun install
cp .env.example .env   # fill in your values
bun run dev
```

## User preferences

- Keep all secrets in environment variables — no hardcoded fallbacks.

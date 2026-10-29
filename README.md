# CarMatch

Answer ten quick questions and get **7 ranked car recommendations** for the US market, grounded in real vehicle data.

- Candidates come only from **fueleconomy.gov** (EPA/DOE) data, with the brand list from **NHTSA vPIC**. No keys needed.
- **gpt-4.1-mini** ranks them with Structured Outputs. It can only pick from the candidate ids it was given, and every pick is validated.
- Prices are labeled **AI estimates**. Photos come from **Wikimedia Commons**, credited on each card.
- Guests can use everything. An account (Supabase email/password) lets you keep up to 10 favorites.

```
frontend/   React + Vite + TypeScript, Tailwind v4, shadcn/ui        → Vercel
backend/    FastAPI, Pydantic v2, httpx (async)                       → Render (native Python)
supabase/   SQL migrations + PGlite tests                            → Supabase (Postgres + Auth)
```

## How a search works

1. The wizard keeps your answers in `sessionStorage`. "Find a car" sends `POST /api/recommend`.
2. The backend validates the input with strict Pydantic models and an 8 KB body cap. It hashes the normalized preferences (SHA-256). If that hash is cached (in memory, then Supabase, 7-day TTL), it returns the cached answer without counting against the rate limit.
3. Otherwise it checks the rate limit: 8 searches per hour per IP, a sliding window in Postgres with an in-memory fallback. Over the limit, it returns `429` with `Retry-After`.
4. It filters the EPA catalog (about 39k vehicles from 1990 onward) by your hard constraints, groups the matches by model year, and keeps a diverse set of at most 40 candidates. If fewer than 7 survive, it relaxes **brand**, then **drivetrain**, then **year range**, and tells you what it relaxed.
5. GPT returns 7 picks: id (constrained by an enum to the candidate ids), rank, score, price range, seats, and 3 bullets. Invalid, duplicate or too-few-seats picks are dropped and backfilled from the data. Cars whose estimated price is over budget are flagged and moved down.
6. It fetches a Commons photo for each car, plus its author and license.

## Local setup

Requirements: Python 3.12+, Node 20+.

```bash
# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env            # all values optional locally
set -a; . ./.env; set +a
.venv/bin/uvicorn app.main:app --reload --port 8000
```

On first start it downloads the EPA dataset (about 2 MB) into `backend/data/`. With no `OPENAI_API_KEY`, results are ranked from the data only and have no price estimates. With no Supabase keys, the cache and rate limiter run in memory.

```bash
# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local      # VITE_API_URL=http://localhost:8000; add Supabase keys to enable accounts
npm run dev                     # http://localhost:5173
```

### Checks

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check . && .venv/bin/mypy app
cd frontend && npm run build && npm run lint      # build runs the strict TypeScript check
cd supabase/tests && npm install && npm test      # runs the migration on in-process Postgres (PGlite)
```

The PGlite suite covers the favorites FIFO trigger (the 11th insert evicts the oldest; re-favoriting evicts nothing), RLS isolation between users, service-role-only access to the cache and limiter tables, and the `rate_limit_hit` function.

**Manual trigger test** in the Supabase SQL editor, which runs as `postgres` and bypasses RLS. Replace `<USER_ID>` with a real id from Authentication → Users:

```sql
insert into favorites (user_id, car_key, car_data)
select '<USER_ID>', 'test-' || g, '{}'::jsonb from generate_series(1, 11) g;   -- one statement = one now(); fine
select count(*) from favorites where user_id = '<USER_ID>';                    -- 10
delete from favorites where car_key like 'test-%';
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com). Pick a US region.
2. **Run the migration.** Paste `supabase/migrations/20261028000000_init.sql` into **SQL Editor → New query → Run**. Or use the CLI: `supabase link --project-ref <ref> && supabase db push`.
3. **Auth → Sign In / Providers**: keep **Email** enabled with "Confirm email" on, and leave every other provider off.
4. **Auth → URL Configuration**: Site URL = your Vercel URL. Add `https://<vercel-domain>/**` and `http://localhost:5173/**` to the Redirect URLs.
5. **Custom SMTP via Resend.** Supabase's built-in mailer is rate-limited and meant for testing.
   1. Create a [Resend](https://resend.com) account. Add and verify your domain (DNS records), then create an API key with "Sending access".
   2. In Supabase, open **Auth → SMTP Settings** and turn on custom SMTP:
      - Host `smtp.resend.com`, port `465`
      - Username `resend`, password = the Resend API key
      - Sender email `no-reply@<your-domain>`, sender name `CarMatch`
   3. Optional: raise the email rate limit under **Auth → Rate Limits**.
6. **Keys** (Project Settings → API / API Keys):
   - **anon / publishable** key → `VITE_SUPABASE_ANON_KEY` (Vercel). Safe for the browser because RLS protects the data.
   - **service_role / secret** key → `SUPABASE_SERVICE_ROLE_KEY` (Render only). Both legacy JWT keys and new `sb_secret_…` keys work.
   - **JWT secret** → `SUPABASE_JWT_SECRET`. Only projects on the legacy HS256 secret need it. Newer projects with JWT signing keys are verified through the JWKS endpoint automatically.

## Deploy

### Backend on Render

1. In Render, open **New → Blueprint**, pick this repo, and it reads `render.yaml`: a native Python web service (no Docker), root `backend/`, health check `/health`.
2. Fill in the env vars it asks for: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (optional), and `ALLOWED_ORIGINS` (your Vercel URL, e.g. `https://carmatch.vercel.app`). Optionally set `ALLOWED_ORIGIN_REGEX` for preview deploys.
3. The build step downloads the EPA dataset, so the first request doesn't wait for it. Note that the free plan sleeps when idle.
4. Check that `https://<service>.onrender.com/health` returns `{"status":"ok","catalog_loaded":true}`.

The rate limiter reads the client IP from `X-Forwarded-For`, counting `TRUSTED_PROXY_HOPS` entries from the right (default 1, Render's proxy). Entries further left are client-controlled, so they are ignored. After the first deploy, check one `recommend ip=…` log line and confirm it shows your public IP. If it shows a proxy address instead, set `TRUSTED_PROXY_HOPS=2`.

### Frontend on Vercel

1. In Vercel, open **Add New → Project** and import the repo. Set **Root Directory = `frontend`** (the framework is detected as Vite; `vercel.json` adds the SPA rewrites).
2. Set the env vars: `VITE_API_URL` (Render URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Deploy. Then put the production domain into Render's `ALLOWED_ORIGINS` and Supabase's Site URL and Redirect URLs.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness check, plus whether the vehicle catalog has loaded |
| GET | `/api/makes` | Brand list (vPIC ∩ EPA) |
| POST | `/api/recommend` | `Preferences` → `RecommendResponse` (see `backend/app/models.py`, mirrored in `frontend/src/lib/types.ts`) |

## Data and attribution

Vehicle data: [fueleconomy.gov](https://www.fueleconomy.gov/feg/ws/) (U.S. EPA / DOE) and [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/). Photos: [Wikimedia Commons](https://commons.wikimedia.org) contributors, credited with author and license on each card. Prices are AI estimates, not offers.

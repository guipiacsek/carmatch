# Setup checklist (what's left for you)

Everything below needs an account, a secret, or a dashboard click. Work top to bottom: each step produces values the next one needs.

**Already in place**

| | |
|---|---|
| GitHub repo (public) | https://github.com/guipiacsek/carmatch |
| Vercel project `carmatch` (team guilherme-ps-projects) | https://mycarmatch.vercel.app. Deployed from the CLI with no env vars yet, so searches fail until step 4. |
| Render | Not created (no `RENDER_API_KEY` was available) |
| Supabase | Not created (no Supabase CLI or login was available) |

---

## 1. Supabase (about 10 min)

1. Go to https://supabase.com/dashboard → **New project**. Name `carmatch`, region **East US** (close to Render Oregon/Virginia and Vercel iad1). Save the DB password somewhere safe.
2. **SQL Editor → New query**: paste all of `supabase/migrations/20261028000000_init.sql`, then **Run**. It should report "Success. No rows returned".
3. **Authentication → Sign In / Providers**:
   - Email: **enabled**, "Confirm email" **on**
   - Every other provider: off
4. **Authentication → URL Configuration**:
   - Site URL: `https://mycarmatch.vercel.app`
   - Redirect URLs (add both): `https://mycarmatch.vercel.app/**` and `http://localhost:5173/**`
5. **Custom SMTP via Resend:**
   1. Sign up at https://resend.com → **Domains → Add domain** (a domain you own) → add the DNS records it shows → wait for "Verified".
   2. Resend **API Keys → Create** (permission: Sending access) → copy the key `re_…`.
   3. Supabase **Authentication → SMTP Settings → Enable custom SMTP**:

      | Field | Value |
      |---|---|
      | Sender email | `no-reply@<your-domain>` |
      | Sender name | `CarMatch` |
      | Host | `smtp.resend.com` |
      | Port | `465` |
      | Username | `resend` |
      | Password | `re_…` (the Resend API key) |
   4. Optional: **Authentication → Rate Limits** → raise "emails per hour" (for example to 30).
6. **Project Settings → API Keys**. Copy these for the next steps:
   - Project URL: `https://<ref>.supabase.co` → **SUPABASE_URL**
   - `anon` (legacy) **or** `sb_publishable_…` key → **SUPABASE_ANON_KEY**
   - `service_role` (legacy) **or** `sb_secret_…` key → **SUPABASE_SERVICE_ROLE_KEY**. Keep it secret, server only.
   - Only if the project still uses the legacy HS256 secret (Project Settings → JWT Keys shows "Legacy JWT secret" as current): copy it → **SUPABASE_JWT_SECRET**. Otherwise leave it blank; the backend uses JWKS automatically.

## 2. OpenAI (2 min)

1. https://platform.openai.com/api-keys → **Create new secret key** (project-scoped, "Restricted" with Model capabilities → Chat completions: Write is enough) → **OPENAI_API_KEY** `sk-…`.
2. Billing → set a monthly usage limit. A search costs roughly $0.002 to $0.004 with gpt-4.1-mini, and cache hits are free.

## 3. Render backend (5 min)

1. https://dashboard.render.com → **New → Blueprint** → connect GitHub, choose `guipiacsek/carmatch`. Render reads `render.yaml` and proposes the **carmatch-api** Python web service.
2. Enter the prompted env vars:

   | Key | Value |
   |---|---|
   | `OPENAI_API_KEY` | `sk-…` from step 2 |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / `sb_secret_…` key |
   | `SUPABASE_JWT_SECRET` | legacy JWT secret, or leave blank |
   | `ALLOWED_ORIGINS` | `https://mycarmatch.vercel.app` |
   | `ALLOWED_ORIGIN_REGEX` | optional, for Vercel preview deploys: `^https://carmatch-[a-z0-9]+-guilherme-ps-projects\.vercel\.app$` |

   `OPENAI_MODEL=gpt-4.1-mini`, `RATE_LIMIT_PER_HOUR=8` and `TRUSTED_PROXY_HOPS=1` are pre-filled.
3. **Apply**, then wait for the build (about 2 to 4 min; it installs the Python packages and downloads the EPA dataset).
4. Open `https://<your-service>.onrender.com/health`. Expect `{"status":"ok","catalog_loaded":true}`. Note this URL: it is **VITE_API_URL**.
5. After your first search (step 5), open **Logs** and find the line `recommend ip=<x.x.x.x> …`. It should show *your* public IP (compare with https://ifconfig.me). If it shows a Render or Cloudflare address, set `TRUSTED_PROXY_HOPS=2` and redeploy.

## 4. Vercel frontend (3 min)

1. https://vercel.com/guilherme-ps-projects/carmatch/settings/environment-variables. Add these for **Production** and **Preview**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-service>.onrender.com` (no trailing slash) |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon / `sb_publishable_…` key |
2. **Settings → Build and Deployment → Root Directory** = `frontend`. Then **Settings → Git → Connect** `guipiacsek/carmatch`, so pushes to `main` deploy automatically.
3. **Deployments → ⋯ → Redeploy** the latest production deployment. `VITE_*` values are baked in at build time, so this step is required.

## 5. Smoke test in production (5 min)

- [ ] Complete the wizard and click "Find a car". You should get 7 cards with photos, an "AI estimate" price range, and 3 bullets each.
- [ ] Run the same search again. It returns instantly (cached).
- [ ] Click a heart as a guest → the modal opens → create an account → confirm from the email (sent via Resend) → the car is saved under **My favorites**.
- [ ] Save 11 different cars. The oldest disappears and a toast explains why.
- [ ] Run 9 *different* searches within an hour. The 9th shows the friendly hourly-limit message.

---

## Final report

**Done**
- Monorepo: `frontend/` (React 19, Vite 8, TS strict, Tailwind v4, shadcn/ui), `backend/` (FastAPI, Pydantic v2, httpx), `supabase/migrations`, `render.yaml`, `frontend/vercel.json`, README, DECISIONS.md.
- Grounded candidate pipeline (EPA + vPIC), GPT ranking with an id enum and post-validation, relaxation with notices, Commons images with attribution, caching, a DB-backed rate limiter with in-memory fallback, optional JWT identification, CORS, payload limits.
- The public GitHub repo is pushed, and the Vercel project is created and deployed.

**Verified locally**
- Backend: 29 pytest tests pass (filters, relaxation order, diversity cap, validation and backfill, over-budget handling, strict schema, mocked OpenAI request, rate limiter, 429 + Retry-After, cache hits not counted, XFF spoofing, 413/422, CORS). `ruff` and `mypy --strict` are clean.
- SQL: 5 PGlite tests pass (FIFO trigger, no eviction on duplicate, RLS, service-role-only tables, `rate_limit_hit`).
- Frontend: strict `tsc` and production build pass. oxlint reports 0 errors and 7 warnings (React fast-refresh and setState-in-effect hints).
- Live run against the real EPA, vPIC and Commons APIs: `/health`, `/api/makes`, `/api/recommend` (about 1.9 s uncached), 429 after the limit, cache hit afterwards.
- Render build and start commands run locally in a fresh virtualenv and serve `/health` and `/api/recommend`.
- Clicked through the browser: all 10 wizard steps, results grid, mobile layout (no horizontal scroll), guest heart → auth modal with the pending favorite stored, 429 message in the UI, no console errors.

**Not verified (needs your accounts)**
- Real `gpt-4.1-mini` responses. The request is unit-tested with a mocked transport; if OpenAI rejects the schema, the API falls back to data-only results and logs `OpenAI error 400: …`.
- Supabase Auth sign-up and sign-in, favorites CRUD against a real project, and the DB-backed cache and limiter over PostgREST.
- Render deploy and its `X-Forwarded-For` behavior (step 3.5).

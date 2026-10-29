# Decisions

These are choices the brief didn't settle, made while building the app autonomously. Each one can be reversed.

## Data and candidates

1. **fueleconomy.gov bulk dataset instead of per-request REST calls.** The `/ws/rest/vehicle/*` services return the same data as `vehicles.csv.zip` (about 2 MB). Building about 40 candidates per search through REST would take hundreds of calls (year → make → model → options → vehicle). The backend loads the dataset into memory instead: the Render build step downloads it, and the app re-downloads it at boot if it is missing or older than 30 days. Searches don't wait on any EPA network call.
2. **Brands = a curated list of 38 current brands** (`PICKER_BRANDS` in vehicles.py, chosen by the owner; it replaced the NHTSA vPIC list, which showed defunct makes like Eagle and Yugo). The catalog is limited to these brands, so "any brand" searches only return them too. EPA spelling variants ("Mini"/"MINI") are merged.
3. **Body types:**
   - Trucks, SUVs, minivans and wagons come from the EPA vehicle class.
   - For cars, the style comes from EPA interior volumes: 2-door → Coupe, 4-door → Sedan, hatchback volume → Hatchback. Model-name hints (Convertible/Roadster, Wagon/Avant) fill in where volumes are missing.
   - "Compact" = EPA minicompact/subcompact/compact cars.
   - A car can match several types (a Civic is Sedan + Hatchback + Compact).
   - Cargo vans and special-purpose vehicles are excluded. So are hydrogen and CNG vehicles, which have no matching wizard option.
4. **Fuel:** EPA `atvType` EV → Electric, Plug-in Hybrid → Plug-in Hybrid, Hybrid → Hybrid, Diesel → Diesel. Flex-fuel and bi-fuel vehicles count as Gas.
5. **Drivetrain:** "4-Wheel or All-Wheel Drive" matches both AWD and 4WD, and EPA's legacy "2-Wheel Drive" counts as RWD.
6. **"New" = the three most recent model years** (next, current, and leftover prior year), intersected with your year range.
7. **Seats have no grounded source.** Cars are prefiltered by a class-based upper bound (two-seater 2, coupe/convertible 4, sedan 5, small SUV 7, large SUV/minivan 8, …). GPT estimates the seat count, and picks below `min_seats` are dropped.
8. **One candidate per (year, make, EPA base model, fuel).** Hybrid/PHEV/EV/diesel variants get a suffix ("RAV4 Hybrid") when the model also comes in other fuels.
9. **Diversity cap:** at most 2 model years per model (the newest, plus a mid-range year for used/either, so price can steer the year). After that, makes take turns, each round in order of a cheap priority heuristic, up to 40 candidates. The heuristic only decides what GPT sees and orders the fallbacks.
10. **Relaxation:** brand → drivetrain → year range (to the full 1990–next-year range in one step). A step counts as relaxed only if you had set that constraint. Body type, fuel, transmission and seats are never relaxed. If fewer than 7 cars still match, the response says so.

## LLM

11. **Raw httpx call to Chat Completions** with `response_format: json_schema, strict: true`. The schema is generated from the Pydantic `LLMResponse`. Ids are constrained by an `enum` of the candidate ids, so the model can't name a car that isn't in the list, and picks are still validated afterwards. Temperature is 0.2. No OpenAI SDK dependency.
12. **Prompt-injection posture.** Preferences and candidates are sent as one `json.dumps` blob, and the system prompt declares it data, never instructions. Every user field is an enum, an int, or a regex-validated brand name.
13. **Post-validation:**
    - Drop picks with unknown or duplicate ids or too few seats, then backfill from the data with grounded bullets and no price.
    - Clamp bullets to exactly 3 of at most 12 words each.
    - Swap min/max price if they are reversed.
    - **Over budget** means the estimated minimum price is above the budget. Those cars are flagged with a badge and moved to the bottom.
14. **No key, or an OpenAI error:** the API still returns 7 data-based results without price estimates, with a notice. Responses from a failed LLM call are not cached, so a fix takes effect immediately. Responses from a deployment with no key are cached.

## Abuse protection and caching

15. **Rate limiter:** a sliding-window log in Postgres through the `rate_limit_hit()` RPC (atomic, with an advisory lock), used when Supabase is configured. It falls back to in-memory if the database is unreachable. A cache hit is checked first and never counts.
16. **Client IP = the Nth `X-Forwarded-For` entry from the right** (`TRUSTED_PROXY_HOPS`, default 1). The leftmost entry is spoofable. See the README for how to verify this on Render.
17. **Cache key** = SHA-256 of `v1:` plus the normalized preferences JSON (sorted, deduplicated lists; lowercased brands). Cached responses include image URLs. Expired rows are purged on write.
18. **Body limit 8 KB.** POST requests without a `Content-Length` get 411. Pydantic models use `extra="forbid"` and bounded lists.
19. **CORS:** exact origins from `ALLOWED_ORIGINS`, plus an optional `ALLOWED_ORIGIN_REGEX` for Vercel preview URLs. CORS is the outermost middleware so 413/429 responses stay readable in the browser (`Retry-After` is exposed).
20. **JWT is optional and only used to log the user id.** It is verified with the legacy HS256 secret when the token is HS256, otherwise through the project's JWKS. An invalid token means guest, not an error.
21. **The OpenAPI docs UI is disabled in production** to keep the surface small.

## Database

22. **Favorites trigger:** BEFORE INSERT takes a per-user advisory lock (so concurrent inserts can't exceed 10) and deletes everything older than the 9 newest. When the car_key already exists, it evicts nothing, so `ON CONFLICT DO NOTHING` can't silently drop a favorite. `user_id` defaults to `auth.uid()`.
23. **`car_data` is capped at 16 KB** and `car_key` at 200 characters, so the jsonb column can't be abused.
24. **SQL tests run on PGlite** (in-process Postgres 17 under Node) with a minimal stub of Supabase's `auth` schema and roles. They need no local Postgres or Supabase CLI.

## Lessons from live GPT testing

34. **The model bends facts toward the shopper.** Shown `min_seats: 7`, gpt-4.1-mini claimed 5-seat SUVs seat 7. Shown a budget, it priced cars down to fit. Fixes:
    - `min_seats` is no longer sent to the model; code enforces it.
    - The schema asks for seats and price before rank and score, since structured outputs generate fields in order.
    - The prompt says estimates must be a neutral appraiser's values.
    - The model returns 3 spare picks so dropped ones still leave 7.
35. **Used = up to the current model year** (next year's cars aren't on the used market). Used searches offer two years per model spread across the range, skipping the newest.
36. **Data-only backfill never claims more seats than the class typically has** (large SUVs count as 5, minivans as 7), and is skipped when that's below `min_seats`. Exotic makes are demoted when the budget is under $100k.
37. **Commons photos:** the closest-year photo within 15 years wins (long-running generations like the Durango only have older photos). Lookups run 3 at a time, per Wikimedia's API etiquette.

38. **Speed.** Photos moved out of `/api/recommend` into `GET /api/image` (validated, cached, `Cache-Control` 7 days), loaded per card after results show. The frontend pings `/health` on page load to wake Render's free tier while the wizard is being answered. Spare picks went down to 2 to trim GPT output.

39. **3 parallel GPT calls instead of one.** Candidates are dealt round-robin by model into 3 groups (all years of a model stay in one group, so batches never return the same model). Each call picks 4, and the best 3 valid ones are kept, for 9 results total. `/api/recommend` streams NDJSON (`meta`, one `cars` line per finished batch, `done` with the final ordered list) so cards appear as batches land. A failed batch's slots get data-only backfill, and that response isn't cached. Final order: within budget first, then match score. GPT is told scores are absolute, since each call only sees a third of the pool. Measured: all 9 cars in about 3.5 to 4.5 s, versus 6 to 8 s for 7 cars in one call.
40. **Client IP behind Render:** the live database showed Render's load balancers appending private `10.x` addresses, a different one per request, so every search counted as a new client. Private and loopback hops are now dropped from the right of `X-Forwarded-For` before counting `TRUSTED_PROXY_HOPS`. `GET /api/client-ip` shows callers the address they're counted under.

41. **Shareable links reuse the recommendation cache.** The share id *is* the SHA-256 cache key (64 hex characters, so it can't be guessed), served by `GET /api/results/{id}` at `/r/<id>`, and it lives as long as the cache entry (7 days). Degraded responses (a failed GPT batch) aren't cached, so they get no share button.
42. **Compare view:** tick up to 3 cards (results, shared results or favorites), then open a side-by-side table. It highlights the lowest price, best match and most seats, but not when every car ties.
43. **"See on Cars.com":** make and year are hard filters, the model goes in as a keyword (EPA names like "F150 Pickup" don't always match Cars.com model slugs), and the condition is "all" for current model years, otherwise "used". Cars.com is behind a bot check, so this couldn't be click-tested automatically. `listingsUrl()` in `src/lib/listings.ts` is where an affiliate ID goes.
44. **First load:** supabase-js, the sign-in dialog, and the results, favorites and shared pages are lazy-loaded. The main bundle went from 434 KB to 331 KB (138 to 104 KB gzipped).

45. **Car details on click.** Clicking a card (or its title, for keyboard users) opens a details panel and makes a second, smaller GPT call (`POST /api/car-details`).
    - Only cars that exist in the EPA catalog are accepted, so arbitrary text can't be sent to GPT.
    - The EPA facts (class, MPG range, drivetrains, transmissions, model variants) go in the prompt and are shown as-is.
    - The answer is cached per car for 7 days in the same cache table, so later opens are instant and free.
    - It has its own rate limit (`DETAILS_RATE_LIMIT_PER_HOUR`, default 40). Opening details is cheaper and more frequent than a search, and it shouldn't use up search quota.
    - The panel says the AI text can be wrong.

## Hosting

33. **No Docker.** Render runs the backend on its native Python runtime (`render.yaml`: pip install, then uvicorn). The stack is just GitHub, Vercel, Render and Supabase.

## Frontend

25. **React Router** for `/`, `/results`, `/favorites`. Wizard state, current step and results live in `sessionStorage` (refreshing the results page doesn't re-query). A pending favorite goes in `localStorage`, so it survives the email-confirmation link opening in a new tab.
26. **Guest favorite flow:** remember the car, open the auth modal, and once signed in, insert it and show a toast. Closing the modal discards it, unless you're waiting on email confirmation.
27. **Brand step:** "No preference" equals an empty list. **Body/fuel:** an empty selection means "any". **Seats:** Any (2+), 4+, 5+, 6+, 7+, 8+.
28. **Budget slider:** New $15k–$150k in $1k steps, Used $3k–$100k in $500 steps, Either $3k–$150k in $1k steps. Changing the condition clamps the budget. Default $35k.
29. **Images:** Commons search for "year make model", then "make model". A photo is accepted only if its title contains the model name and has no year more than 6 years off. 800px thumbnails, with a styled placeholder on miss or load error.
30. **"See listings"** points to a Google search for now. `listingsUrl()` in `CarCard.tsx` is the single place to swap in affiliate links.
31. **Dark mode** follows the OS setting, with no toggle.
32. **Tooling:** the current Vite template ships TypeScript 7 and oxlint. Strict mode is on. shadcn/ui uses the radix-nova preset with a blue primary color.
- Visual design: "Color Arc" (chosen from design-concepts/1). Montserrat, light gray canvas, each result card carries a colored arc (`--arc-1..4`), results page is a dashboard (concept 6): best-match hero, stat tiles, search / best value / saved panels, then every match in a horizontal snap carousel with a floating compare toolbar. Desktop nav is a slim left rail. The concept's AI assistant panel is left out until there is a backend for it.
- Search latency: on Render's small CPU, fresh TLS handshakes to Supabase and OpenAI cost ~2s per search. The shared httpx client uses HTTP/2 (one connection carries all 3 parallel GPT calls) and a warm-up loop keeps those connections open for 15 min after a visitor's page-load ping (`/health?warm=1`; the uptime cron doesn't send it). The cache write happens after the `done` event. Photos are prefetched server-side as each batch lands.
- Photos: Commons searches drop EPA words like "Hybrid" ("G-Class Hybrid" found nothing); year+model first, then model only.
- SEO: the app is a client-rendered SPA, so search engines get static guide pages instead (`/best/*`, the same 10 "Top 10" lists as the in-app Rankings page). `python -m app.seo` (in backend/, with OPENAI_API_KEY) runs the real search pipeline for each guide and writes plain HTML plus `sitemap.xml` into frontend/public; re-run monthly and redeploy. Guides drop cars the app flags as over budget, since the title promises "under $X". "Personalize this list" links to `/results?p=<prefs JSON>`. robots.txt keeps per-visitor pages (/results, /favorites, /r/) out of the index.
- Rankings (`/rankings`): 10 static "Top 10" lists, no live search. `python -m app.seo` writes them to `frontend/public/rankings.json` (photos included) along with the `/best` pages. For rankings the budget is hidden from the AI, like `min_seats`: with it, estimates bent to fit (a Corvette E-Ray at $48k). Code then drops over-budget and unpriced cars, running extra rounds over untried models until 10 remain. Used lists use 5-10-year-old cars so honest prices fit.
- Model names: EPA's `baseModel` lumps distinct cars ("500X" under "500", BMW M3/M4 under "M"). When the model's first word extends the base with more than a lowercase trim letter (G37x, i3s) or a slash/hyphen suffix, that word is the model.

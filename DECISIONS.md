# Decisions

These are choices the brief didn't settle, made while building the app autonomously. Each one can be reversed.

## Data and candidates

1. **fueleconomy.gov bulk dataset instead of per-request REST calls.** The `/ws/rest/vehicle/*` services return the same data as `vehicles.csv.zip` (about 2 MB). Building about 40 candidates per search through REST would take hundreds of calls (year → make → model → options → vehicle). The backend loads the dataset into memory instead: it is baked into the Docker image at build time and re-downloaded at boot if older than 30 days. Searches don't wait on any EPA network call.
2. **Brand list = vPIC makes (car, MPV, truck) that have EPA data, plus EPA makes with 40 or more records** (e.g. Scion, McLaren, which vPIC files elsewhere). This drops vPIC's trailer and motorcycle makers. EPA spelling variants ("Mini"/"MINI") are merged.
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
24. **SQL tests run on PGlite** (in-process Postgres 17 under Node) with a minimal stub of Supabase's `auth` schema and roles. They need no Docker or Supabase CLI.

## Frontend

25. **React Router** for `/`, `/results`, `/favorites`. Wizard state, current step and results live in `sessionStorage` (refreshing the results page doesn't re-query). A pending favorite goes in `localStorage`, so it survives the email-confirmation link opening in a new tab.
26. **Guest favorite flow:** remember the car, open the auth modal, and once signed in, insert it and show a toast. Closing the modal discards it, unless you're waiting on email confirmation.
27. **Brand step:** "No preference" equals an empty list. **Body/fuel:** an empty selection means "any". **Seats:** Any (2+), 4+, 5+, 6+, 7+, 8+.
28. **Budget slider:** New $15k–$150k in $1k steps, Used $3k–$100k in $500 steps, Either $3k–$150k in $1k steps. Changing the condition clamps the budget. Default $35k.
29. **Images:** Commons search for "year make model", then "make model". A photo is accepted only if its title contains the model name and has no year more than 6 years off. 800px thumbnails, with a styled placeholder on miss or load error.
30. **"See listings"** points to a Google search for now. `listingsUrl()` in `CarCard.tsx` is the single place to swap in affiliate links.
31. **Dark mode** follows the OS setting, with no toggle.
32. **Tooling:** the current Vite template ships TypeScript 7 and oxlint. Strict mode is on. shadcn/ui uses the radix-nova preset with a blue primary color.

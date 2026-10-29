-- CarMatch initial schema: favorites (RLS + FIFO cap), recommendation cache, rate limiter.

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  car_key text not null check (char_length(car_key) between 1 and 200),
  car_data jsonb not null check (pg_column_size(car_data) < 16384),
  created_at timestamptz not null default now(),
  unique (user_id, car_key)
);

create index favorites_user_created_idx on public.favorites (user_id, created_at);

-- Max 10 favorites per user. Inserting the 11th deletes the oldest (FIFO), so the newest is always kept.
create or replace function public.favorites_enforce_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_favorites constant int := 10;
begin
  -- Serialize concurrent inserts for the same user so the count can't race past the cap.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  -- A duplicate car_key will hit the unique constraint (or ON CONFLICT); don't evict anything for it.
  if exists (select 1 from public.favorites f where f.user_id = new.user_id and f.car_key = new.car_key) then
    return new;
  end if;

  delete from public.favorites
  where id in (
    select f.id from public.favorites f
    where f.user_id = new.user_id
    order by f.created_at desc, f.id desc
    offset max_favorites - 1
  );

  return new;
end;
$$;

create trigger favorites_enforce_limit
before insert on public.favorites
for each row execute function public.favorites_enforce_limit();

alter table public.favorites enable row level security;

create policy "favorites_select_own" on public.favorites
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.favorites from anon;
grant select, insert, delete on public.favorites to authenticated;

-- ---------------------------------------------------------------------------
-- recommendation_cache (service role only; TTL enforced by the backend, 7 days)
-- ---------------------------------------------------------------------------
create table public.recommendation_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index recommendation_cache_created_idx on public.recommendation_cache (created_at);

alter table public.recommendation_cache enable row level security;
revoke all on public.recommendation_cache from anon, authenticated;
grant all on public.recommendation_cache to service_role;

-- ---------------------------------------------------------------------------
-- rate limiter (sliding window log, service role only)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

create index rate_limits_key_hit_idx on public.rate_limits (key, hit_at);
create index rate_limits_hit_idx on public.rate_limits (hit_at);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Records a hit if under the limit. Returns allowed + seconds until the next slot frees up.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, retry_after int)
language plpgsql
set search_path = ''
as $$
declare
  window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  hits int;
  oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key, 1));

  -- Prune expired hits for every key so the table stays small.
  delete from public.rate_limits r where r.hit_at <= window_start;
  select count(*), min(r.hit_at) into hits, oldest from public.rate_limits r where r.key = p_key;

  if hits >= p_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from oldest + make_interval(secs => p_window_seconds) - now()))::int);
    return;
  end if;

  insert into public.rate_limits (key) values (p_key);
  return query select true, 0;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

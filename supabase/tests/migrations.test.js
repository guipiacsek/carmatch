// Runs the real migration on in-process Postgres (PGlite) with a minimal stub of Supabase's auth schema/roles.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
  `);
  for (const f of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
  }
});

// Each call is its own transaction, so now() (created_at) advances between inserts.
async function asUser(userId, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

const insertFav = (user, key) =>
  asUser(user, "insert into public.favorites (car_key, car_data) values ($1, '{}') on conflict (user_id, car_key) do nothing", [key]);
const favKeys = async (user) =>
  (await asUser(user, "select car_key from public.favorites order by created_at")).rows.map((r) => r.car_key);

test("11th favorite evicts the oldest (FIFO), newest is kept", async () => {
  for (let i = 1; i <= 11; i++) await insertFav(USER_A, `car-${i}`);
  const keys = await favKeys(USER_A);
  assert.equal(keys.length, 10);
  assert.ok(!keys.includes("car-1"), "oldest evicted");
  assert.ok(keys.includes("car-11"), "newest saved");
});

test("re-favoriting an existing car does not evict anything", async () => {
  await insertFav(USER_A, "car-5");
  const keys = await favKeys(USER_A);
  assert.equal(keys.length, 10);
  assert.ok(keys.includes("car-2"), "car-2 still present");
});

test("RLS: users only see and delete their own favorites", async () => {
  await insertFav(USER_B, "b-car");
  assert.deepEqual(await favKeys(USER_B), ["b-car"]);
  await asUser(USER_B, "delete from public.favorites where car_key = 'car-11'");
  assert.ok((await favKeys(USER_A)).includes("car-11"), "B cannot delete A's row");
  await assert.rejects(
    asUser(USER_B, `insert into public.favorites (user_id, car_key, car_data) values ('${USER_A}', 'x', '{}')`),
    /row-level security/,
  );
});

test("anon and authenticated cannot read cache or rate limits", async () => {
  await assert.rejects(asUser(USER_A, "select * from public.recommendation_cache"), /permission denied/);
  await assert.rejects(asUser(USER_A, "select public.rate_limit_hit('x', 1, 60)"), /permission denied/);
});

test("rate_limit_hit allows up to the limit, then returns retry_after", async () => {
  await db.exec("set role service_role;");
  try {
    const hit = async () => (await db.query("select * from public.rate_limit_hit('1.2.3.4', 3, 3600)")).rows[0];
    for (let i = 0; i < 3; i++) assert.equal((await hit()).allowed, true);
    const blocked = await hit();
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retry_after > 3500 && blocked.retry_after <= 3600);
    const other = (await db.query("select * from public.rate_limit_hit('5.6.7.8', 3, 3600)")).rows[0];
    assert.equal(other.allowed, true, "limits are per key");
  } finally {
    await db.exec("reset role;");
  }
});

# SQL hierarchy tests

Proves the database hierarchy rules in `docs/SPEC.md` section 4 (data model)
and the Part 1 bullets of section 11 (acceptance criteria), by actually
running the real migration files (`supabase/migrations/0001..0005`) against
an in-memory [PGlite](https://pglite.dev) Postgres instance — no network,
no real Supabase project needed.

## How to run

```sh
npx vitest run tests/sql
```

(or `npm run test`, which picks up everything under `tests/**/*.test.ts`).

Each test calls `freshDb()` from `tests/sql/harness.ts`, which boots a brand
new PGlite database and applies all five migrations in order, so tests never
share state. The whole suite (13 tests across two files) runs in ~10-11
seconds.

## Files

- `tests/sql/harness.ts` — `freshDb()` (new PGlite DB + migrations 0001-0005)
  and `loadSeed()` (applies `supabase/seed.sql`), plus small `row`/`rows`
  query helpers.
- `tests/sql/schema.test.ts` — hierarchy/trigger/event/analytics/money tests.
- `tests/sql/seed.test.ts` — proves `supabase/seed.sql` loads cleanly and
  produces the row counts described in spec section 11.

## What had to be stubbed, and why

PGlite is plain Postgres (via WASM) — it has no Supabase platform around it.
Two things the migrations assume are missing and had to be stubbed in
`harness.ts`, applied once per fresh database **before** any migration runs:

1. **`auth.uid()`** — migration `0005_rls.sql` calls this inside
   `is_owner()`. We create the `auth` schema and a trivial
   `auth.uid() returns uuid ... select null::uuid` stand-in. Since there is
   no real authenticated session in these tests, `auth.uid()` is always
   `null`, which is fine — none of the hierarchy/trigger/view behaviour
   under test depends on RLS actually allowing/denying rows (the app always
   talks to Postgres through the service-role key, which bypasses RLS
   entirely, per `docs/CONTRACTS.md`).

2. **The `authenticated` and `anon` roles** — `0005_rls.sql` does
   `create policy ... to authenticated` and, implicitly by Postgres default
   grants, references `anon`/`authenticated` as ordinary roles that exist by
   default on every real Supabase project but not on a bare PGlite instance.
   Without creating them first, loading `0005_rls.sql` fails with
   `role "authenticated" does not exist` and then `role "anon" does not
   exist` (confirmed experimentally — see below). We run
   `create role authenticated; create role anon;` before 0005 loads.
   **No migration file was edited** to make this work — the stub lives
   entirely in the test harness.

### What did NOT need stubbing

- **`pg_trgm`** and **`pgcrypto`** — both are real, working PGlite
  extensions (`@electric-sql/pglite/contrib/pg_trgm` and `.../pgcrypto`),
  verified by passing them into `new PGlite({ extensions: { pg_trgm,
  pgcrypto } })`. `create extension if not exists pg_trgm` /
  `create extension if not exists pgcrypto` in `0001_core.sql` load exactly
  as written, so `gen_random_uuid()` and the trigram indexes both work for
  real in these tests.
- Migrations `0001_core.sql` through `0004_analytics.sql` load completely
  unmodified — no stubbing needed for any of the core/money/push-calendar/
  analytics schema, triggers, or views.

## What is NOT covered / could not be verified here

- **Row Level Security itself.** `0005_rls.sql` is loaded (so we know it is
  syntactically valid and applies to every table listed), but no test in
  this suite connects as the `authenticated` role and tries to prove that
  `is_owner()` actually allows/denies specific rows. The app's own Postgres
  connection always uses the service-role key (bypasses RLS), so this was
  judged out of scope for a hierarchy test suite — flag it if RLS-as-enforced
  behaviour needs its own coverage.
- **`google_tokens` revoke.** We confirm `0005_rls.sql`'s final
  `revoke all on google_tokens from authenticated, anon;` statement runs
  without error, but don't separately assert that `authenticated` can no
  longer read the table (same reasoning as above — no non-service-role
  connection is exercised in these tests).
- Everything else requested — task→project→goal→area inheritance, the
  composite FK's `ON UPDATE CASCADE`, subtask inheritance, project→goal area
  inheritance, `completed_at`/`task_events` lifecycle, the analytics views
  (`v_goal_progress`, `v_task_effort`), the money views
  (`v_owed_by_label`, `v_wallet`, `v_account_balances`) and `supabase/seed.sql`
  — is exercised against the real migration files and passes.

## Result (most recent run)

```
Test Files  2 passed (2)
     Tests  13 passed (13)
  Duration  ~11s
```

No migration file was edited to make any test pass. No bugs were found in
the migrations during this work.

// Test harness for the real Supabase migrations, run against an in-memory
// PGlite database. See docs/SQL_TESTS.md for what is stubbed and why.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const MIGRATION_FILES = [
  '0001_core.sql',
  '0002_money.sql',
  '0003_push_calendar.sql',
  '0004_analytics.sql',
  '0005_rls.sql',
  '0006_statuses.sql',
  '0007_life_calendar.sql',
  '0008_deadlines_priorities.sql',
  '0009_habit_task_link.sql',
  '0010_gtasks_sync.sql',
  '0011_calendar_edit.sql',
  '0012_books.sql',
  '0013_external_ids.sql',
  '0014_ui_state_habit_links_indexes.sql',
  '0015_calendar_sync_state_habit_times.sql',
  '0016_budgets_scheduled_payments.sql',
  '0017_editable_agreed_and_completed.sql',
  '0018_habit_day_times.sql',
  '0019_pomodoro.sql',
  '0020_pomodoro_unique_segments.sql',
  '0021_transactions_owed_view.sql',
  '0022_habit_extra_days.sql',
  '0023_review_status_task_indexes.sql',
  '0024_transaction_labels.sql',
];

// Supabase provides these for free; PGlite does not, so we stub the minimum
// needed for the migrations to load. See docs/SQL_TESTS.md.
const SUPABASE_STUBS = `
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$
  select null::uuid
$$;
create role authenticated;
create role anon;
`;

/**
 * Creates a fresh in-memory PGlite database with the Supabase stubs and all
 * five migrations applied, in order. Every test should call this itself so
 * tests do not share state.
 */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });

  // pg_trgm / pgcrypto are real PGlite extensions (verified against the
  // installed package); no stubbing needed for `create extension`.
  await db.exec(SUPABASE_STUBS);

  for (const file of MIGRATION_FILES) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.exec(sql);
  }

  return db;
}

/** Loads supabase/seed.sql on top of an already-migrated database. */
export async function loadSeed(db: PGlite): Promise<void> {
  const seedPath = path.resolve(__dirname, '../../supabase/seed.sql');
  const sql = fs.readFileSync(seedPath, 'utf8');
  await db.exec(sql);
}

/** Convenience: run a query and return just the rows. */
export async function rows<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

/** Convenience: run a query and return the first row (or undefined). */
export async function row<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const res = await db.query<T>(sql, params);
  return res.rows[0];
}

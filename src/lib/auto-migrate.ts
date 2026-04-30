import 'server-only';
import { getSchemaSql } from './schema-sql';

/**
 * Auto-run supabase/schema.sql against the operator's Postgres
 * (DATABASE_URL).
 *
 * ───────────── Why direct Postgres ─────────────
 * Supabase's REST API (which the rest of customerdog uses via
 * supabase-js) doesn't accept arbitrary DDL even with the service-
 * role key. Running CREATE TABLE requires a direct Postgres
 * connection — which means a separate connection string the operator
 * grabs from Supabase → Settings → Database → Connection string →
 * "Transaction pooler" (port 6543, serverless-friendly).
 *
 * ───────────── Will this wipe data? ─────────────
 * No. Two layers of safety:
 *   1. requireSchema() in admin-guard.ts only calls this when its
 *      probe of the `config` table FAILS — i.e., the schema is
 *      genuinely missing. On warm/cold starts where tables exist,
 *      this function is never invoked.
 *   2. As a belt-and-suspenders check, this function ALSO probes
 *      information_schema.tables for our four tables before running
 *      DDL. If they all exist, we mark migrated and return without
 *      touching the database.
 *   3. Even if both checks somehow misfire, schema.sql itself is
 *      idempotent (CREATE TABLE IF NOT EXISTS, INSERT … ON CONFLICT
 *      DO NOTHING) — a forced re-run is a no-op against existing data.
 *
 * Single-flight: concurrent callers wait on the same migration
 * promise so cold-start fan-outs don't run the schema multiple times.
 */

const EXPECTED_TABLES = [
  'config',
  'kb_sources',
  'conversations',
  'actions',
] as const;

let migrated = false;
let inflight: Promise<boolean> | null = null;
let lastError: string | null = null;

/** Last failure message from runMigrationOnce(), so /admin/setup can
 *  show "this is what we tried, this is why it didn't work" instead
 *  of a useless 500. Cleared on next successful run. */
export function getLastMigrationError(): string | null {
  return lastError;
}

export async function tryAutoMigrate(): Promise<boolean> {
  if (migrated) return true;
  if (!process.env.DATABASE_URL) return false;
  if (inflight) return inflight;

  inflight = runMigrationOnce()
    .then((ok) => {
      migrated = ok;
      if (ok) lastError = null;
      return ok;
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[auto-migrate] failed:', msg);
      lastError = msg;
      return false;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

async function runMigrationOnce(): Promise<boolean> {
  // Dynamic import so `pg` is only loaded by functions that actually
  // need it — functions that never hit a missing-schema path don't
  // pay the cold-start cost.
  const { Client } = await import('pg');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();

  try {
    // Belt-and-suspenders: short-circuit if all tables already exist.
    // requireSchema() shouldn't have called us in that case, but if
    // anything ever drove this path with a populated DB, we want a
    // hard "skip the DDL" before running it.
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [[...EXPECTED_TABLES]],
    );
    const have = new Set(existing.rows.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !have.has(t));

    if (missing.length === 0) {
      console.log(
        '[auto-migrate] all expected tables present; skipping DDL.',
      );
      return true;
    }

    console.log(
      `[auto-migrate] missing tables: ${missing.join(', ')} — running schema.sql`,
    );
    // schema.sql is idempotent. We pass it as a single multi-statement
    // query; node-postgres runs it atomically.
    await client.query(getSchemaSql());
    console.log('[auto-migrate] schema.sql applied successfully');
    return true;
  } finally {
    await client.end().catch(() => {});
  }
}

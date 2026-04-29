import 'server-only';
import { getSchemaSql } from './schema-sql';

/**
 * Optional: auto-run supabase/schema.sql against a direct Postgres
 * connection when the operator has set DATABASE_URL.
 *
 * Why DATABASE_URL specifically: Supabase's REST API (which the rest
 * of customerdog uses via supabase-js) doesn't accept arbitrary DDL
 * even with the service-role key. Running CREATE TABLE requires a
 * direct Postgres connection — and the connection string includes a
 * separate password the operator can grab from
 * Supabase → Settings → Database → Connection string. Use the
 * "Transaction pooler" / port 6543 URL — it's serverless-friendly.
 *
 * If DATABASE_URL is unset, this function returns false and the admin
 * pages fall through to /admin/setup (the click-to-install flow).
 *
 * Single-flight: concurrent callers wait on the same migration
 * promise so we don't run the schema multiple times against the same
 * cold-start window. Once successful, an in-memory flag short-circuits
 * future calls.
 */

let migrated = false;
let inflight: Promise<boolean> | null = null;

export async function tryAutoMigrate(): Promise<boolean> {
  if (migrated) return true;
  if (!process.env.DATABASE_URL) return false;
  if (inflight) return inflight;

  inflight = runMigration()
    .then((ok) => {
      migrated = ok;
      return ok;
    })
    .catch((e) => {
      console.error('[auto-migrate] failed:', e);
      return false;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

async function runMigration(): Promise<boolean> {
  // Dynamic import so `pg` is only loaded by functions that actually
  // need it. Functions that never hit a missing-schema path don't pay
  // the cold-start cost.
  const { Client } = await import('pg');

  const sql = getSchemaSql();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    // Supabase requires SSL. The pooled URL includes ?sslmode=require
    // by default; this is a belt-and-suspenders fallback.
    ssl: { rejectUnauthorized: false },
    // 15s connect — Supabase free tier can be cold.
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();
  try {
    // schema.sql is idempotent (CREATE TABLE IF NOT EXISTS,
    // ON CONFLICT DO NOTHING). Safe to re-run.
    await client.query(sql);
    console.log('[auto-migrate] schema applied successfully');
    return true;
  } finally {
    await client.end().catch(() => {});
  }
}

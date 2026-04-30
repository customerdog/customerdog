import 'server-only';
import { redirect } from 'next/navigation';
import { tryAutoMigrate } from './auto-migrate';
import { supabase } from './supabase';

/**
 * Run at the top of any admin page that touches Supabase. Three-tier:
 *
 *   1. Schema (incl. all latest tables) present → render the page
 *   2. Schema missing OR outdated + DATABASE_URL → auto-migrate
 *   3. Schema missing, no DATABASE_URL → redirect to /admin/setup
 *      (click-to-install fallback)
 *
 * The probe targets the LATEST-added table. Two scenarios this covers
 * in one check:
 *   - Fresh deploy, no tables at all → probe fails → migrate
 *   - Older deploy missing the latest table → probe fails → migrate
 *     (idempotent; CREATE TABLE IF NOT EXISTS no-ops the existing
 *     tables, creates the missing one)
 *
 * Other Supabase errors (auth, network) fall through to /admin/error.tsx.
 */

// Update this when adding a new table to schema.sql so the schema probe
// always targets the most recently introduced table. Two callers depend
// on it: requireSchema (gates admin pages) AND /admin/setup (decides
// whether to redirect back to /admin). They MUST agree, otherwise an
// upgrade where this latest table is missing creates a redirect loop.
export const LATEST_TABLE = 'actions';

/** True if the deploy's database has every table in schema.sql,
 *  inferred by probing the most recently added one. False if any
 *  schema-related error fires; rethrows on auth/network failures. */
export async function isSchemaCurrent(): Promise<boolean> {
  const probe = await supabase()
    .from(LATEST_TABLE)
    .select('id')
    .limit(1);
  if (!probe.error) return true;
  if (isSchemaMissing(probe.error)) return false;
  // Some other Supabase error — let admin/error.tsx classify it.
  throw new Error(probeErrorMessage(probe.error));
}

export async function requireSchema(): Promise<void> {
  if (await isSchemaCurrent()) return;

  // Schema missing or outdated — try auto-migrate.
  const migrated = await tryAutoMigrate();
  if (migrated) {
    if (await isSchemaCurrent()) return;
    throw new Error(
      `Migration ran, but ${LATEST_TABLE} still isn't readable. Check Vercel logs for the auto-migrate output.`,
    );
  }

  // No DATABASE_URL or migration failed — fall back to manual setup.
  redirect('/admin/setup');
}

/** Detect the Postgres / Supabase "table not found" shape. Handles
 *  both Error instances and PostgrestError (plain objects with .message,
 *  .code, .details — what supabase-js actually returns). */
export function isSchemaMissing(err: unknown): boolean {
  if (!err) return false;
  const msg = probeErrorMessage(err);
  const code = (err as { code?: string }).code ?? '';
  return (
    code === 'PGRST205' ||
    code === '42P01' || // postgres "undefined_table"
    msg.includes('PGRST205') ||
    /relation .+ does not exist/i.test(msg) ||
    msg.includes('Could not find the table') ||
    msg.includes("Could not find the 'public.") ||
    msg.includes('does not exist in the schema cache')
  );
}

function probeErrorMessage(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Best-effort link to the deploying project's Supabase SQL Editor.
 *  Pulls the project ref out of the SUPABASE_URL we already have. */
export function getSupabaseSqlEditorUrl(): string {
  const url = process.env.SUPABASE_URL ?? '';
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(url);
  if (!m) return 'https://supabase.com/dashboard';
  return `https://supabase.com/dashboard/project/${m[1]}/sql/new`;
}

/** Compatibility alias. customerdog used to compose schema + tool
 *  registration here; tool registration moved to qlaud's tenant-mode
 *  dashboard, so requireSetup is now just requireSchema. Kept as
 *  a named export so admin pages don't all need to be touched on
 *  every refactor. */
export const requireSetup = requireSchema;

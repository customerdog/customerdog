import 'server-only';
import { redirect } from 'next/navigation';
import { tryAutoMigrate } from './auto-migrate';
import { supabase } from './supabase';
import { ensureToolsRegistered } from './tool-register';

/**
 * Run at the top of any admin page that touches Supabase. Three-tier:
 *
 *   1. Schema (incl. all latest tables) present → render the page
 *   2. Schema missing OR outdated + DATABASE_URL → auto-migrate
 *   3. Schema missing, no DATABASE_URL → redirect to /admin/setup
 *      (click-to-install fallback)
 *
 * The probe targets the LATEST-added table (tool_registrations), not
 * the oldest. Two scenarios this covers in one check:
 *   - Fresh deploy, no tables at all → probe fails → migrate
 *   - Older deploy that only has the original 4 tables → probe fails
 *     → migrate (idempotent; CREATE TABLE IF NOT EXISTS no-ops the
 *     existing 4, creates the missing 5th)
 *
 * Other Supabase errors (auth, network) fall through to /admin/error.tsx.
 */

// Update this when adding a new table to schema.sql so requireSchema's
// probe always targets the most recently introduced table.
const LATEST_TABLE = 'tool_registrations';

export async function requireSchema(): Promise<void> {
  const probe = await supabase()
    .from(LATEST_TABLE)
    .select('name')
    .limit(1);

  if (!probe.error) return; // schema is current

  if (!isSchemaMissing(probe.error)) {
    // Auth / network / something else — admin/error.tsx will surface.
    throw new Error(probeErrorMessage(probe.error));
  }

  // Schema missing or outdated — try auto-migrate.
  const migrated = await tryAutoMigrate();
  if (migrated) {
    // Verify the migration did what we expected.
    const verify = await supabase().from(LATEST_TABLE).select('name').limit(1);
    if (!verify.error) return;
    throw new Error(
      `Migration ran, but ${LATEST_TABLE} still isn't readable: ${probeErrorMessage(verify.error)}`,
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

/**
 * Compose schema + tools as a single "is this deploy fully bootstrapped"
 * check. Call this from any admin page that needs both the database AND
 * the tool registrations to be in place. Internally:
 *   1. requireSchema() — ensures all current tables exist (auto-migrates
 *      if any are missing or the deploy was upgraded from an older
 *      schema version).
 *   2. ensureToolsRegistered() — registers any tool defined in
 *      src/lib/tools/definitions.ts that doesn't yet have a row in
 *      tool_registrations. Idempotent + cached.
 */
export async function requireSetup(): Promise<void> {
  await requireSchema();
  await ensureToolsRegistered();
}

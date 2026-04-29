import 'server-only';
import { redirect } from 'next/navigation';
import { tryAutoMigrate } from './auto-migrate';
import { getConfig } from './supabase';
import { ensureToolsRegistered } from './tool-register';

/**
 * Run at the top of any admin page that touches Supabase. Three-tier:
 *
 *   1. Schema present                → fall through, render the page
 *   2. Schema missing + DATABASE_URL → auto-migrate, then re-check
 *   3. Schema missing, no DATABASE_URL → redirect to /admin/setup
 *      (click-to-install flow)
 *
 * Other Supabase errors (auth, network) fall through to the
 * /admin/error.tsx boundary, which has its own cause-guessing.
 */
export async function requireSchema(): Promise<void> {
  try {
    await getConfig();
    return;
  } catch (e) {
    if (!isSchemaMissing(e)) throw e;
  }

  // Schema missing — try auto-migrate if the operator opted in.
  const migrated = await tryAutoMigrate();
  if (migrated) {
    try {
      await getConfig();
      return;
    } catch (e) {
      // Migration ran but config still unreadable — let the error
      // boundary surface what's actually wrong (auth? RLS?).
      throw e;
    }
  }

  // No DATABASE_URL or migration failed — fall back to manual setup.
  redirect('/admin/setup');
}

/**
 * Compose schema + tools as a single "is this deploy fully bootstrapped"
 * check. Call this from any admin page that needs both the database AND
 * the tool registrations to be in place. Internally:
 *   1. requireSchema() — ensures the four core tables exist
 *   2. ensureToolsRegistered() — registers any tool defined in
 *      src/lib/tools/definitions.ts that doesn't yet have a row in
 *      tool_registrations. Idempotent + cached.
 *
 * Tools are bootstrap-on-demand: the first admin to land on the
 * dashboard after a fresh deploy triggers registration. Subsequent
 * loads find the rows in Supabase and short-circuit (loadRegistrations
 * caches in memory).
 */
export async function requireSetup(): Promise<void> {
  await requireSchema();
  // Tool registration failures bubble to /admin/error.tsx with the
  // raw message — usually 401 (bad QLAUD_KEY) or 409 (qlaud already
  // has the name registered out-of-band).
  await ensureToolsRegistered();
}

/** Detect Supabase's "table not found" error shape. */
export function isSchemaMissing(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('PGRST205') ||
    /relation .+ does not exist/i.test(msg) ||
    msg.includes('Could not find the table') ||
    msg.includes("Could not find the 'public.")
  );
}

/** Best-effort link to the deploying project's Supabase SQL Editor.
 *  Pulls the project ref out of the SUPABASE_URL we already have. */
export function getSupabaseSqlEditorUrl(): string {
  const url = process.env.SUPABASE_URL ?? '';
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(url);
  if (!m) return 'https://supabase.com/dashboard';
  return `https://supabase.com/dashboard/project/${m[1]}/sql/new`;
}

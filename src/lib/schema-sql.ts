import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads supabase/schema.sql from disk so the /admin/setup page can
 * render it for the operator to copy into Supabase's SQL Editor.
 *
 * Cached at module level — the file never changes between deploys.
 * `process.cwd()` at runtime on Vercel is the project root, same as
 * locally.
 */

let cached: string | null = null;

export function getSchemaSql(): string {
  if (cached) return cached;
  const path = join(process.cwd(), 'supabase', 'schema.sql');
  cached = readFileSync(path, 'utf-8');
  return cached;
}

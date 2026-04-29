import 'server-only';

/**
 * Detect a half-configured deploy. Returns the list of required env
 * vars that are unset (or empty), so pages can render a friendly
 * setup screen instead of crashing on the first env getter that
 * throws.
 *
 * NOTE: this reads process.env directly, NOT through env.ts — env.ts
 * throws on missing required vars (the right behavior for code paths
 * that genuinely need them) but throwing isn't useful here. We just
 * want a yes/no audit.
 */

type RequiredVar = { name: string; reason: string };

const REQUIRED_VARS: ReadonlyArray<RequiredVar> = [
  {
    name: 'QLAUD_KEY',
    reason: 'qlaud API access — needed for chat to work at all',
  },
  {
    name: 'SUPABASE_URL',
    reason: 'Supabase storage — config, KB, conversations, audit log',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    reason: 'Supabase service-role key (NOT the anon key)',
  },
  {
    name: 'ADMIN_PASSWORD',
    reason: 'gates /admin/* sign-in',
  },
  {
    name: 'ADMIN_COOKIE_SECRET',
    reason: 'signs admin session cookies; rotate to log all admins out',
  },
];

export type MissingVar = RequiredVar;

export function getMissingRequiredEnv(): MissingVar[] {
  return REQUIRED_VARS.filter((v) => {
    const value = process.env[v.name];
    return !value || value.trim() === '';
  });
}

export function isSetupComplete(): boolean {
  return getMissingRequiredEnv().length === 0;
}

/** Typed env access. Throws on missing required vars at first use so we
 *  fail fast in dev / on first request, not silently. The list mirrors
 *  .env.example one-for-one — keep both in sync. */

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing env var: ${name}. See .env.example for the full list.`,
    );
  }
  return v;
};

const optional = (name: string): string | undefined => process.env[name];

export const env = {
  // Public — readable by both client + server bundles.
  NEXT_PUBLIC_APP_URL: () => required('NEXT_PUBLIC_APP_URL'),

  // Clerk
  CLERK_WEBHOOK_SECRET: () => required('CLERK_WEBHOOK_SECRET'),

  // Supabase
  SUPABASE_URL: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // qlaud
  QLAUD_BASE_URL: () => optional('QLAUD_BASE_URL') ?? 'https://api.qlaud.ai',
  QLAUD_MASTER_KEY: () => required('QLAUD_MASTER_KEY'),

  // qlaud per-tool secrets — populated by scripts/register-tools.ts after
  // the first deploy. Optional at boot; required at the moment a webhook
  // fires for that specific tool.
  QLAUD_TOOL_SECRET_WEB_SEARCH: () => optional('QLAUD_TOOL_SECRET_WEB_SEARCH'),
  QLAUD_TOOL_SECRET_GENERATE_IMAGE: () =>
    optional('QLAUD_TOOL_SECRET_GENERATE_IMAGE'),
  QLAUD_TOOL_SECRET_SAVE_TO_DRIVE: () =>
    optional('QLAUD_TOOL_SECRET_SAVE_TO_DRIVE'),
};

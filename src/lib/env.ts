import 'server-only';

/** Typed env access. Throws on missing required vars at first use so we
 *  fail fast in dev / on first request, not silently. The list mirrors
 *  .env.example one-for-one — keep both in sync.
 *
 *  SECURITY: server-only — every getter exposes a secret (qlaud master
 *  key, Clerk webhook secret, Supabase service-role key, admin cookie
 *  signing key). Client code that needs a public value should read
 *  process.env.NEXT_PUBLIC_… directly. */

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

  // Clerk (still required while chat routes use Clerk; commit 3 removes)
  CLERK_WEBHOOK_SECRET: () => required('CLERK_WEBHOOK_SECRET'),

  // qlaud
  QLAUD_BASE_URL: () => optional('QLAUD_BASE_URL') ?? 'https://api.qlaud.ai',
  QLAUD_MASTER_KEY: () => required('QLAUD_MASTER_KEY'),

  // qlaud per-tool secrets — populated by scripts/register-tools.ts after
  // the first deploy. Optional at boot; required at the moment a webhook
  // fires for that specific tool.
  QLAUD_TOOL_SECRET_WEB_SEARCH: () => optional('QLAUD_TOOL_SECRET_WEB_SEARCH'),
  QLAUD_TOOL_SECRET_GENERATE_IMAGE: () =>
    optional('QLAUD_TOOL_SECRET_GENERATE_IMAGE'),

  // Supabase — Project Settings → API. Service-role key bypasses RLS;
  // the schema intentionally has no RLS policies (server-only access).
  SUPABASE_URL: () => required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // Admin gate — single shared password + cookie signing key.
  // Generate strong values: `openssl rand -base64 32` for both.
  ADMIN_PASSWORD: () => required('ADMIN_PASSWORD'),
  ADMIN_COOKIE_SECRET: () => required('ADMIN_COOKIE_SECRET'),
};

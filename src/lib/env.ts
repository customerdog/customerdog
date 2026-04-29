import 'server-only';

/** Typed env access. Throws on missing required vars at first use so we
 *  fail fast in dev / on first request, not silently. The list mirrors
 *  .env.example one-for-one — keep both in sync.
 *
 *  SECURITY: server-only — every getter exposes a secret (qlaud key,
 *  Supabase service-role key, admin cookie signing key, tool HMAC
 *  secrets). Client code that needs a public value should read
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

  // qlaud — single key for all chat + admin (tool registration). Get
  // one at qlaud.ai/keys; admin scope is required for
  // /v1/tools, standard scope is fine for chat alone.
  QLAUD_BASE_URL: () => optional('QLAUD_BASE_URL') ?? 'https://api.qlaud.ai',
  QLAUD_KEY: () => required('QLAUD_KEY'),

  // qlaud per-tool HMAC secrets — populated by scripts/register-tools.ts
  // after the first deploy. Optional at boot; required at the moment a
  // webhook fires for that specific tool.
  QLAUD_TOOL_SECRET_CREATE_TICKET: () =>
    optional('QLAUD_TOOL_SECRET_CREATE_TICKET'),
  QLAUD_TOOL_SECRET_SEND_EMAIL: () =>
    optional('QLAUD_TOOL_SECRET_SEND_EMAIL'),

  // Supabase — Project Settings → API. Service-role key bypasses RLS;
  // the schema intentionally has no RLS policies (server-only access).
  SUPABASE_URL: () => required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // Optional: direct Postgres connection string (Supabase →
  // Settings → Database → Connection string → Transaction pooler).
  // If set, /admin/setup is skipped — schema.sql runs automatically
  // on the first admin page load. If unset, the operator runs the
  // schema manually via the /admin/setup click flow.
  DATABASE_URL: () => optional('DATABASE_URL'),

  // Admin gate — single shared password + cookie signing key.
  // Generate strong values: `openssl rand -base64 32` for both.
  ADMIN_PASSWORD: () => required('ADMIN_PASSWORD'),
  ADMIN_COOKIE_SECRET: () => required('ADMIN_COOKIE_SECRET'),

  // ─── Optional integrations (used by the create_ticket / send_email
  // tools — set whichever your config selects). ───────────────────────

  // Resend — for send_email + (if ticket_destination='email') outbound
  // email tickets. Get an API key at resend.com.
  RESEND_API_KEY: () => optional('RESEND_API_KEY'),

  // Email destination
  TICKET_EMAIL_TO: () => optional('TICKET_EMAIL_TO'),

  // Slack destination
  SLACK_WEBHOOK_URL: () => optional('SLACK_WEBHOOK_URL'),

  // Linear destination
  LINEAR_API_KEY: () => optional('LINEAR_API_KEY'),
  LINEAR_TEAM_ID: () => optional('LINEAR_TEAM_ID'),

  // Zendesk destination
  ZENDESK_SUBDOMAIN: () => optional('ZENDESK_SUBDOMAIN'),
  ZENDESK_EMAIL: () => optional('ZENDESK_EMAIL'),
  ZENDESK_API_TOKEN: () => optional('ZENDESK_API_TOKEN'),
};

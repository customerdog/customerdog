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

  // Supabase — Project Settings → API. Service-role key bypasses RLS;
  // the schema intentionally has no RLS policies (server-only access).
  SUPABASE_URL: () => required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // Direct Postgres connection string (Supabase → Settings → Database
  // → Connection string → "Session pooler" tab, port 5432). Required
  // so schema.sql runs automatically on the first admin page load —
  // no manual SQL Editor step. Use Session pooler, NOT Transaction
  // pooler — Transaction pooler can reject multi-statement DDL.
  //
  // The connection is opened only when our probe of the config table
  // fails (i.e., schema is genuinely missing), so the migration never
  // re-runs against a populated database. schema.sql is also
  // idempotent (CREATE TABLE IF NOT EXISTS, INSERT ON CONFLICT DO
  // NOTHING) — even a forced re-run wouldn't wipe data.
  DATABASE_URL: () => required('DATABASE_URL'),

  // Admin gate — single shared password + cookie signing key.
  // Generate strong values: `openssl rand -base64 32` for both.
  ADMIN_PASSWORD: () => required('ADMIN_PASSWORD'),
  ADMIN_COOKIE_SECRET: () => required('ADMIN_COOKIE_SECRET'),

  // ─── Optional ─────────────────────────────────────────────────────

  // Model override. Defaults to claude-haiku-4-5 (cheap + fast + keeps
  // Anthropic prompt cache for the KB). Set this to any model qlaud
  // routes to — e.g. claude-sonnet-4-6, gpt-4o-mini, gpt-4.1-mini,
  // gemini-2.5-flash, deepseek-chat, mistral-medium-3. See qlaud's
  // compatibility table at docs.qlaud.ai for the full list.
  QLAUD_MODEL: () => optional('QLAUD_MODEL'),

  // Firecrawl — when set, KB ingestion routes URL fetches through
  // Firecrawl's /v1/scrape endpoint, which renders pages in a real
  // browser server-side. Use this if your sources are client-rendered
  // SPAs that the native fetch+Readability path can't see into.
  // Without it, customerdog handles SSR/SSG pages (most docs and
  // marketing sites) just fine. Free tier covers 500 page-credits
  // at firecrawl.dev.
  FIRECRAWL_API_KEY: () => optional('FIRECRAWL_API_KEY'),
};

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Single Supabase client for the whole server. Uses the service-role key
 * — bypasses RLS, can read/write any row. Server-only by construction
 * (`import 'server-only'` makes Next.js refuse to bundle this for the
 * browser; the service-role key would let an attacker dump the DB).
 *
 * No row-level security is defined; access is gated entirely by which
 * server endpoints exist + how /admin is auth-gated. Don't ship a public
 * API route that takes arbitrary `from('table').select()` from a query
 * string.
 *
 * Typing approach: we don't pass a generated Database<> generic to
 * createClient (the supabase-js v2.105+ shape requires extra
 * boilerplate that adds nothing for a 4-table schema). Instead each
 * query returns the loose default types and callers cast the Row[]
 * payload to the exported row types below.
 *
 * Lazy: client is built on first import. Env is read once and cached.
 */

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_ROLE_KEY(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// ─── Row types ─────────────────────────────────────────────────────────
// Hand-typed mirrors of supabase/schema.sql. If you add a column over
// there, mirror it here so callers cast to the right shape.

export type ConfigRow = {
  id: 1;
  company_name: string;
  brand_color: string;
  ticket_destination: 'email' | 'slack' | 'linear' | 'zendesk';
  visitor_contact_required: 'none' | 'email' | 'phone' | 'either';
  support_email: string | null;
  system_prompt_extras: string | null;
  updated_at: string;
};

export type KbSourceRow = {
  id: string;
  type: 'url' | 'markdown' | 'pasted';
  source: string;
  parsed_content: string;
  active: boolean;
  updated_at: string;
};

export type ConversationRow = {
  id: string;
  anon_visitor_id: string;
  qlaud_thread_id: string;
  started_at: string;
  ended_at: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  resolved: boolean;
  summary: string | null;
};

export type ActionRow = {
  id: string;
  conversation_id: string | null;
  type: 'ticket_created' | 'email_sent' | 'contact_collected';
  payload: Record<string, unknown>;
  result_url: string | null;
  created_at: string;
};

// ─── Convenience helpers used across admin + chat handlers ─────────────

/** Read the single config row. Throws if missing (the schema seeds it). */
export async function getConfig(): Promise<ConfigRow> {
  const { data, error } = await supabase()
    .from('config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`getConfig: ${error.message}`);
  return data as ConfigRow;
}

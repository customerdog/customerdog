import 'server-only';
import { qlaud, QlaudError } from './qlaud';
import { supabase, type ToolRegistrationRow } from './supabase';
import { toolDefs } from './tools/definitions';

/**
 * Tool registration as a self-bootstrapping process.
 *
 * Old flow (manual):
 *   - Operator runs `npm run register-tools` locally
 *   - Pastes printed QLAUD_TOOL_SECRET_* values into env
 *   - Redeploys
 *
 * New flow (automatic):
 *   - On first admin page load, ensureToolsRegistered() compares the
 *     toolDefs() in this repo against rows in `tool_registrations`.
 *   - For any tool not yet registered (or whose webhook_url has
 *     changed because the operator switched domains), it calls qlaud
 *     POST /v1/tools and writes the result to Supabase.
 *   - Tool route handlers read the HMAC secret from Supabase (with
 *     env fallback for legacy operators who already ran the script).
 *   - Chat handler reads tool IDs from Supabase too — no qlaud
 *     listTools() round-trip per cold start.
 *
 * Idempotent + cached. Module-level Map dedupes on warm starts; once
 * a tool is in the table, ensure() returns instantly without touching
 * qlaud.
 *
 * The `npm run register-tools` script still exists as a manual escape
 * hatch — useful for forced re-registration or operator debugging.
 */

let cache: Map<string, ToolRegistrationRow> | null = null;

/** Read all rows; cache for the worker's lifetime. */
async function loadRegistrations(): Promise<Map<string, ToolRegistrationRow>> {
  if (cache) return cache;
  const { data, error } = await supabase()
    .from('tool_registrations')
    .select('*');
  if (error) throw new Error(`loadRegistrations: ${error.message}`);
  const m = new Map<string, ToolRegistrationRow>();
  for (const row of (data as ToolRegistrationRow[] | null) ?? []) {
    m.set(row.name, row);
  }
  cache = m;
  return m;
}

/** Invalidate the in-memory cache. Called after a successful register. */
function bustCache() {
  cache = null;
}

/** Register any tool defined in toolDefs() that doesn't yet exist in
 *  the tool_registrations table. Returns the count newly registered.
 *  Throws on qlaud failures so the admin error boundary can surface it. */
export async function ensureToolsRegistered(): Promise<{
  registered: number;
  skipped: number;
}> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is not set — cannot register tools without a webhook URL.',
    );
  }

  const existing = await loadRegistrations();
  const wanted = toolDefs(baseUrl);

  let registered = 0;
  let skipped = 0;

  for (const def of wanted) {
    const have = existing.get(def.name);
    // Skip if already registered AND the webhook URL hasn't drifted.
    if (have && have.webhook_url === def.webhook_url) {
      skipped++;
      continue;
    }

    try {
      const result = await qlaud.registerTool(def);
      const { error: insErr } = await supabase()
        .from('tool_registrations')
        .upsert({
          name: def.name,
          qlaud_tool_id: result.id,
          hmac_secret: result.secret,
          webhook_url: def.webhook_url,
          registered_at: new Date().toISOString(),
        });
      if (insErr) {
        throw new Error(`Supabase insert: ${insErr.message}`);
      }
      registered++;
    } catch (e) {
      // 409 means qlaud already has a tool with this name. The operator
      // either ran the manual script earlier, or another deploy beat us.
      // Either way, we have NO secret for it on our side — explain.
      if (e instanceof QlaudError && e.status === 409) {
        throw new Error(
          `qlaud already has a tool named "${def.name}", but customerdog doesn't have its secret. DELETE it from qlaud (https://qlaud.ai/keys) and reload — we'll re-register and capture the new secret.`,
        );
      }
      throw e;
    }
  }

  if (registered > 0) bustCache();
  return { registered, skipped };
}

/** Lookup a single tool by name. Used by webhook handlers to resolve
 *  the HMAC secret. */
export async function getToolByName(
  name: string,
): Promise<ToolRegistrationRow | null> {
  const map = await loadRegistrations();
  return map.get(name) ?? null;
}

/** Lookup all registered qlaud tool IDs. Used by /api/chat to attach
 *  the available tools to each message. */
export async function getRegisteredToolIds(): Promise<string[]> {
  const map = await loadRegistrations();
  return [...map.values()].map((r) => r.qlaud_tool_id);
}

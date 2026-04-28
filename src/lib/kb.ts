import 'server-only';
import { getConfig, type KbSourceRow, supabase } from './supabase';
import { htmlToText } from './html-to-text';

/**
 * Knowledge base operations.
 *
 * Storage: each KB source is one row in `kb_sources`. URLs get fetched
 * + parsed at ingest time and the parsed text is stored — we don't re-
 * fetch on every chat (re-fetching every chat would melt the source
 * site and add 100s of ms latency). Re-ingest a URL by deleting the
 * row and re-adding it.
 *
 * Hot path (chat): `getSystemPrompt()` runs ONE Supabase query for the
 * config + active sources, concatenates, returns. No in-memory cache —
 * keeps things consistent across serverless instances. The expensive
 * part (the LLM seeing the long prompt) is cached by Anthropic's
 * prompt cache via `cache_control` on the system field, set in
 * /api/chat (commit 3 of the rewrite).
 */

// ─── Limits ────────────────────────────────────────────────────────────

/** Max bytes of parsed content we'll store per source. Keeps any single
 *  doc from blowing up the system prompt; admins can split a giant page
 *  into multiple `pasted` rows if they need more nuance. */
const MAX_CONTENT_BYTES = 200_000;

/** Max bytes the WHOLE assembled system prompt can be before we warn.
 *  Sonnet's context is large; Anthropic's prompt cache makes long
 *  system prompts cheap. But we still want a sanity ceiling. */
const SYSTEM_PROMPT_SOFT_LIMIT_BYTES = 1_500_000;

// ─── Ingestion ─────────────────────────────────────────────────────────

/** Fetch + parse a URL into plain text. Throws on network/format errors. */
export async function fetchAndParseUrl(url: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Not a valid URL: ${url}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${u.protocol} (use http or https)`);
  }

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'customerdog-kb-fetcher/1.0 (+customer-support-agent)',
        accept: 'text/html, text/markdown, text/plain, */*;q=0.5',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`Network error fetching ${u}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  const body = await res.text();
  let parsed: string;
  if (ct.includes('text/html') || body.trimStart().startsWith('<')) {
    parsed = htmlToText(body);
  } else {
    parsed = body;
  }

  if (parsed.length === 0) {
    throw new Error('Fetched page contained no extractable text');
  }
  if (parsed.length > MAX_CONTENT_BYTES) {
    parsed = parsed.slice(0, MAX_CONTENT_BYTES);
  }
  return parsed;
}

// ─── CRUD ──────────────────────────────────────────────────────────────

export async function listSources(): Promise<KbSourceRow[]> {
  const { data, error } = await supabase()
    .from('kb_sources')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`listSources: ${error.message}`);
  return data ?? [];
}

export async function addSource(args: {
  type: KbSourceRow['type'];
  source: string;
  parsed_content: string;
}): Promise<KbSourceRow> {
  if (!args.source.trim()) throw new Error('source is empty');
  if (!args.parsed_content.trim()) throw new Error('content is empty');
  const content =
    args.parsed_content.length > MAX_CONTENT_BYTES
      ? args.parsed_content.slice(0, MAX_CONTENT_BYTES)
      : args.parsed_content;
  const { data, error } = await supabase()
    .from('kb_sources')
    .insert({
      type: args.type,
      source: args.source.trim(),
      parsed_content: content,
    })
    .select()
    .single();
  if (error) throw new Error(`addSource: ${error.message}`);
  return data;
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase().from('kb_sources').delete().eq('id', id);
  if (error) throw new Error(`deleteSource: ${error.message}`);
}

export async function setSourceActive(
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase()
    .from('kb_sources')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`setSourceActive: ${error.message}`);
}

// ─── System prompt assembly ───────────────────────────────────────────

/** Build the full system prompt the chat handler sends to qlaud. The
 *  result is cacheable (we wrap it in a `cache_control: ephemeral`
 *  marker on the message-level), so it being long is fine. */
export async function getSystemPrompt(): Promise<{
  text: string;
  bytes: number;
  sources: number;
}> {
  const [config, sources] = await Promise.all([
    getConfig(),
    listActiveSources(),
  ]);

  const policy = describeContactPolicy(config.visitor_contact_required);
  const kb = sources
    .map((s) => `## Source: ${s.source}\n\n${s.parsed_content}`)
    .join('\n\n---\n\n');

  const text = [
    `You are the AI customer support agent for **${config.company_name}**.`,
    '',
    `## Your role`,
    '',
    `Answer visitor questions accurately using the knowledge base below. Be concise, friendly, and never invent facts that aren't in the knowledge base. If a visitor asks something outside the KB, say so honestly and offer to escalate.`,
    '',
    `## Escalation`,
    '',
    `When you can't fully resolve an issue, escalate by calling the **create_ticket** tool with a clear summary of the problem. ${policy}`,
    '',
    config.system_prompt_extras
      ? [`## Additional instructions`, '', config.system_prompt_extras, ''].join(
          '\n',
        )
      : null,
    `## Knowledge base`,
    '',
    kb || '_(no knowledge base content yet — admin should add sources at /admin/kb)_',
  ]
    .filter((x): x is string => x !== null)
    .join('\n');

  return { text, bytes: text.length, sources: sources.length };
}

async function listActiveSources(): Promise<KbSourceRow[]> {
  const { data, error } = await supabase()
    .from('kb_sources')
    .select('*')
    .eq('active', true)
    .order('updated_at', { ascending: true });
  if (error) throw new Error(`listActiveSources: ${error.message}`);
  return data ?? [];
}

function describeContactPolicy(
  p: 'none' | 'email' | 'phone' | 'either',
): string {
  switch (p) {
    case 'none':
      return 'You do not need to collect contact info before escalating.';
    case 'email':
      return "Before calling create_ticket, ask the visitor for their email address and validate it looks like a real email. Pass the email in the tool input.";
    case 'phone':
      return "Before calling create_ticket, ask the visitor for a phone number we can reach them at. Accept international format (e.g., +1 555-555-5555). Pass the phone in the tool input.";
    case 'either':
      return "Before calling create_ticket, ask the visitor for either an email address or a phone number — whichever is easier for them. Pass whichever they provide in the tool input.";
  }
}

export const KB_LIMITS = {
  MAX_CONTENT_BYTES,
  SYSTEM_PROMPT_SOFT_LIMIT_BYTES,
};

import 'server-only';
import { getConfig, type KbSourceRow, supabase } from './supabase';
import { extractContent } from './html-extract';

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

/**
 * Fetch + parse a URL into plain text. Two paths:
 *
 *   • If FIRECRAWL_API_KEY is set in env, route through Firecrawl's
 *     /v1/scrape endpoint. Firecrawl renders the page in a real
 *     browser and returns clean markdown — handles client-rendered
 *     SPAs that our native fetch can't see into.
 *   • Otherwise: native fetch + Readability-based extraction. Free,
 *     fast, works for any SSR/SSG page (most marketing + docs sites).
 */
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

  let parsed: string;
  if (process.env.FIRECRAWL_API_KEY) {
    parsed = await fetchViaFirecrawl(u.toString());
  } else {
    parsed = await fetchAndExtractNative(u.toString());
  }

  if (parsed.length === 0) {
    throw new Error('Fetched page contained no extractable text');
  }
  if (parsed.length > MAX_CONTENT_BYTES) {
    parsed = parsed.slice(0, MAX_CONTENT_BYTES);
  }
  return parsed;
}

/** Default path: native fetch + Readability extraction. */
async function fetchAndExtractNative(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'customerdog-kb-fetcher/1.0 (+customer-support-agent)',
        accept: 'text/html, text/markdown, text/plain, */*;q=0.5',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`Network error fetching ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  const body = await res.text();
  if (ct.includes('text/html') || body.trimStart().startsWith('<')) {
    return extractContent(body, url);
  }
  return body;
}

/** Opt-in path: Firecrawl handles JS rendering server-side. */
async function fetchViaFirecrawl(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY!;
  let res: Response;
  try {
    res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new Error(`Firecrawl network error: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Firecrawl ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    success?: boolean;
    data?: { markdown?: string };
    error?: string;
  };
  if (!body.success || !body.data?.markdown) {
    throw new Error(body.error ?? 'Firecrawl returned no markdown');
  }
  return body.data.markdown;
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

  const kb = sources
    .map((s) => `## Source: ${s.source}\n\n${s.parsed_content}`)
    .join('\n\n---\n\n');

  const text = [
    `You are the AI customer support agent for **${config.company_name}**.`,
    '',
    `## Your role`,
    '',
    `Answer visitor questions accurately using the knowledge base below. Be concise, friendly, and never invent facts that aren't in the knowledge base. If a visitor asks something outside the KB, say so honestly.`,
    '',
    `## Tools`,
    '',
    `You may have access to additional tools (file ticket, send email, look up customer data, etc.) — these are surfaced by qlaud's tenant-mode dispatch. Use them naturally when relevant. If you need contact information from the visitor before taking an action that involves them (e.g., emailing them a recap, filing a ticket on their behalf), ask politely first.`,
    '',
    config.support_email
      ? `If a tool fails, tell the visitor to reach us at ${config.support_email}.`
      : null,
    config.system_prompt_extras
      ? ['', `## Additional instructions`, '', config.system_prompt_extras].join(
          '\n',
        )
      : null,
    '',
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

export const KB_LIMITS = {
  MAX_CONTENT_BYTES,
  SYSTEM_PROMPT_SOFT_LIMIT_BYTES,
};

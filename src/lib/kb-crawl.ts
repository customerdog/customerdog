import 'server-only';
import { fetchAndParseUrl, addSource } from './kb';
import { supabase } from './supabase';

/**
 * Multi-page KB ingestion. Two strategies, tried in order:
 *
 *   1. Sitemap (sitemap.xml + sitemap_index.xml). Most modern doc
 *      generators (Mintlify, Docusaurus, GitBook, etc.) emit one.
 *      This is the path that works for docs.qlaud.ai.
 *   2. Same-origin link extraction. Fetch the base page, parse all
 *      <a href> on the same origin. One level deep — we don't recurse
 *      because that explodes; the operator can run the crawler again
 *      from a sub-page if they need more depth.
 *
 * Limits: capped at 50 pages per crawl, parallel fetches at 5-wide.
 * Vercel chat-route's maxDuration is 60s; with 5-way parallelism and
 * ~300ms per fetch, 50 pages typically finish in 3-6s.
 *
 * Dedupe: skip any URL that's already present in kb_sources.source.
 * Re-running the crawl on a docs site you've partially indexed adds
 * only the new pages.
 */

export const CRAWL_LIMIT = 50;
const PARALLEL = 5;
const SAFE_PATH_RE = /\.(html?|md|txt)$|\/$|^[^.]+$/i;
const SKIP_PATH_RE =
  /\.(pdf|png|jpe?g|gif|svg|webp|ico|css|js(on)?|zip|tar|gz|mp4|webm|woff2?|ttf)$/i;

export type CrawlSummary = {
  baseUrl: string;
  discovered: number;
  added: number;
  skippedAlreadyIndexed: number;
  skippedFailed: number;
  failures: Array<{ url: string; error: string }>;
};

export async function crawlSite(
  baseUrl: string,
  max = CRAWL_LIMIT,
): Promise<CrawlSummary> {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error(`Not a valid URL: ${baseUrl}`);
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${base.protocol}`);
  }

  const discovered = await discoverUrls(base, max);
  if (discovered.length === 0) {
    throw new Error(
      `Didn't find any pages from ${base}. Try a more specific URL, or paste the docs as markdown instead.`,
    );
  }

  // Dedupe against already-indexed URLs.
  const existing = await getExistingSources();
  const todo = discovered.filter((u) => !existing.has(u)).slice(0, max);
  const skippedAlreadyIndexed = discovered.length - todo.length;

  const failures: Array<{ url: string; error: string }> = [];
  let added = 0;

  // Fetch + parse + insert in batches of PARALLEL. Sequential batches
  // keep us well under Vercel's function timeout while still fast.
  for (let i = 0; i < todo.length; i += PARALLEL) {
    const batch = todo.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const text = await fetchAndParseUrl(url);
        await addSource({
          type: 'url',
          source: url,
          parsed_content: text,
        });
        return url;
      }),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        added++;
      } else {
        failures.push({
          url: batch[j],
          error:
            r.reason instanceof Error
              ? r.reason.message.slice(0, 200)
              : String(r.reason).slice(0, 200),
        });
      }
    }
  }

  return {
    baseUrl: base.toString(),
    discovered: discovered.length,
    added,
    skippedAlreadyIndexed,
    skippedFailed: failures.length,
    failures,
  };
}

// ─── Discovery ─────────────────────────────────────────────────────────

async function discoverUrls(base: URL, max: number): Promise<string[]> {
  // 1. Try sitemap.xml + sitemap_index.xml.
  const fromSitemap = await trySitemap(base, max);
  if (fromSitemap.length > 0) return fromSitemap;

  // 2. Fall back to extracting <a href> from the base page itself.
  return tryLinkExtraction(base, max);
}

async function trySitemap(base: URL, max: number): Promise<string[]> {
  const candidates = [
    new URL('/sitemap.xml', base),
    new URL('/sitemap_index.xml', base),
    new URL('/sitemap-index.xml', base),
  ];

  for (const candidate of candidates) {
    const xml = await safeFetchText(candidate.toString());
    if (!xml) continue;

    const locs = extractLocs(xml);
    if (locs.length === 0) continue;

    // Recurse into nested sitemap-index entries (they end in .xml).
    const nestedSitemaps = locs.filter((u) => u.endsWith('.xml'));
    const pageUrls = locs.filter((u) => !u.endsWith('.xml'));

    for (const nested of nestedSitemaps) {
      if (pageUrls.length >= max) break;
      const nestedXml = await safeFetchText(nested);
      if (!nestedXml) continue;
      pageUrls.push(...extractLocs(nestedXml).filter((u) => !u.endsWith('.xml')));
    }

    return filterCandidatePages(pageUrls, base, max);
  }

  return [];
}

async function tryLinkExtraction(base: URL, max: number): Promise<string[]> {
  const html = await safeFetchText(base.toString());
  if (!html) return [];

  const hrefs = extractHrefs(html, base);
  // Always include the base page itself in the crawl.
  return filterCandidatePages([base.toString(), ...hrefs], base, max);
}

// ─── HTML / XML parsing ────────────────────────────────────────────────

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const url = decodeXmlEntities(m[1].trim());
    if (url) out.push(url);
  }
  return out;
}

function extractHrefs(html: string, base: URL): string[] {
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.origin !== base.origin) continue;
      u.hash = '';
      seen.add(u.toString());
    } catch {
      /* skip malformed */
    }
  }
  return [...seen];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ─── Filtering ─────────────────────────────────────────────────────────

function filterCandidatePages(
  urls: string[],
  base: URL,
  max: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (out.length >= max) break;
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    if (SKIP_PATH_RE.test(u.pathname)) continue;
    if (!SAFE_PATH_RE.test(u.pathname)) continue;
    u.hash = '';
    const normalized = u.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function safeFetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'customerdog-kb-crawler/1.0',
        accept: 'text/html, text/xml, application/xml, */*;q=0.5',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function getExistingSources(): Promise<Set<string>> {
  const { data } = await supabase()
    .from('kb_sources')
    .select('source')
    .eq('type', 'url');
  const out = new Set<string>();
  for (const row of (data as Array<{ source: string }> | null) ?? []) {
    out.add(row.source);
  }
  return out;
}

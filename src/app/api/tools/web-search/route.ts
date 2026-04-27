import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { verifyToolWebhook } from '@/lib/tools/verify-signature';

export const runtime = 'nodejs';

const Input = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

// POST /api/tools/web-search — qlaud → us, signed.
//
// Implementation note: this demo uses DuckDuckGo's instant-answer
// endpoint, which is keyless and good enough for showcasing the tool
// loop. Swap for Brave/Tavily/SerpAPI in real apps.
export async function POST(req: Request) {
  const secret = env.QLAUD_TOOL_SECRET_WEB_SEARCH();
  if (!secret) {
    return NextResponse.json(
      { output: 'web_search tool not configured', is_error: true },
      { status: 200 },
    );
  }
  const raw = await req.text();
  if (!verifyToolWebhook(req.headers, raw, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  const body = JSON.parse(raw) as { input?: unknown };
  const parsed = Input.safeParse(body.input ?? {});
  if (!parsed.success) {
    return NextResponse.json({
      output: `bad input: ${parsed.error.message}`,
      is_error: true,
    });
  }
  const { query, limit = 5 } = parsed.data;

  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_redirect', '1');
  url.searchParams.set('no_html', '1');

  let payload: {
    Heading?: string;
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    payload = await r.json();
  } catch (e) {
    return NextResponse.json({
      output: `search failed: ${(e as Error).message}`,
      is_error: true,
    });
  }

  const hits: Array<{ title: string; url: string; snippet: string }> = [];
  if (payload.AbstractText && payload.AbstractURL) {
    hits.push({
      title: payload.Heading ?? query,
      url: payload.AbstractURL,
      snippet: payload.AbstractText,
    });
  }
  for (const t of payload.RelatedTopics ?? []) {
    if (hits.length >= limit) break;
    if (t.Text && t.FirstURL) {
      hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
    }
  }

  return NextResponse.json({
    output: hits.length > 0 ? { query, results: hits } : `no results for "${query}"`,
  });
}

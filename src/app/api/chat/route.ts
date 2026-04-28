import { NextResponse } from 'next/server';
import { qlaud, QlaudError } from '@/lib/qlaud';
import {
  getOrCreateVisitorId,
  getThreadId,
  setThreadId,
} from '@/lib/anon-session';
import { getSystemPrompt } from '@/lib/kb';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory cache of the deployment's registered tool ids. Pulled once
// per worker boot and reused — listing on every request would be
// wasteful and the set rarely changes (rotation requires a redeploy).
let toolIdsCache: { ids: string[]; loadedAt: number } | null = null;
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

async function getToolIds(): Promise<string[]> {
  const now = Date.now();
  if (toolIdsCache && now - toolIdsCache.loadedAt < TOOL_CACHE_TTL_MS) {
    return toolIdsCache.ids;
  }
  try {
    const r = await qlaud.listTools();
    const ids = r.data.map((t) => t.id);
    toolIdsCache = { ids, loadedAt: now };
    return ids;
  } catch {
    return toolIdsCache?.ids ?? [];
  }
}

// POST /api/chat
//
// Body: { message: string }
//
// Anonymous flow:
//   1. Read cd_visitor cookie (mint if missing) — used as qlaud's
//      end_user_id so the same visitor's threads stay correlated.
//   2. Read cd_thread cookie. If missing, create a new qlaud thread
//      and a `conversations` row in Supabase, then set the cookie.
//   3. Assemble the system prompt from the KB (Supabase). Send to
//      qlaud as a structured message with cache_control: ephemeral —
//      Anthropic's prompt cache eats the cost on every subsequent
//      turn for this visitor.
//   4. Stream the SSE response back to the browser verbatim.
//
// Tools: when none are registered, we stream. When tools ARE attached
// (commit 4 onward), we fall back to non-streaming because qlaud
// doesn't allow stream + tools together. Tools handle escalation, so
// most visitor turns won't trigger them.
type ErrStatus = 400 | 401 | 402 | 403 | 404 | 429 | 500 | 502 | 503;
const errStatus = (n: number): ErrStatus =>
  ([400, 401, 402, 403, 404, 429, 500, 502, 503].includes(n)
    ? n
    : 502) as ErrStatus;

export async function POST(req: Request) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const visitorId = await getOrCreateVisitorId();
  let threadId = await getThreadId();

  // First message of this visitor's session: mint thread + log it.
  if (!threadId) {
    try {
      const thread = await qlaud.createThread({ endUserId: visitorId });
      threadId = thread.id;
      await setThreadId(threadId);
      // Fire-and-forget the conversations row write — failure to log
      // shouldn't block the chat (Supabase outage shouldn't kill
      // visitor support).
      void supabase()
        .from('conversations')
        .insert({
          anon_visitor_id: visitorId,
          qlaud_thread_id: threadId,
        })
        .then(({ error }) => {
          if (error) {
            console.error('[chat] log conversation failed:', error.message);
          }
        });
    } catch (e) {
      const status = e instanceof QlaudError ? errStatus(e.status) : 502;
      return NextResponse.json(
        {
          error: 'failed to start conversation',
          detail: e instanceof Error ? e.message : String(e),
        },
        { status },
      );
    }
  }

  // Assemble system prompt + tool list in parallel.
  let systemText: string;
  let tools: string[];
  try {
    const [sys, t] = await Promise.all([getSystemPrompt(), getToolIds()]);
    systemText = sys.text;
    tools = t;
  } catch (e) {
    return NextResponse.json(
      {
        error: 'failed to assemble context',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  // Anthropic-style structured `system` field with cache_control marker.
  // qlaud forwards this verbatim to Anthropic, which prompt-caches the
  // long KB so subsequent turns in the same visitor's conversation cost
  // ~10% of an uncached turn.
  const requestBody: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    content: message,
    ...(tools.length > 0 ? { tools } : {}),
  };

  // qlaud's docs: streaming + tools is not supported. With tools,
  // call non-streaming and shape the response into a one-shot
  // SSE-like envelope so the client UI doesn't need a second branch.
  if (tools.length > 0) {
    try {
      const result = await qlaud.sendMessage({ threadId, body: requestBody });
      return NextResponse.json(result);
    } catch (e) {
      const status = e instanceof QlaudError ? errStatus(e.status) : 502;
      return NextResponse.json(
        {
          error: 'upstream failed',
          detail: e instanceof Error ? e.message : String(e),
        },
        { status },
      );
    }
  }

  // Toolless path: stream SSE straight through.
  let upstream: Response;
  try {
    upstream = await qlaud.streamMessage({ threadId, body: requestBody });
  } catch (e) {
    const status = e instanceof QlaudError ? errStatus(e.status) : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'upstream failed' },
      { status },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, detail: text.slice(0, 500) },
      { status: errStatus(upstream.status) },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-qlaud-thread-id':
        upstream.headers.get('x-qlaud-thread-id') ?? threadId,
    },
  });
}

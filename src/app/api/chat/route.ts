import { NextResponse } from 'next/server';
import { qlaud, QlaudError } from '@/lib/qlaud';
import {
  getOrCreateVisitorId,
  getThreadId,
  setThreadId,
} from '@/lib/anon-session';
import { getSystemPrompt } from '@/lib/kb';
import { getMissingRequiredEnv } from '@/lib/setup-check';
import { supabase } from '@/lib/supabase';
import { getRegisteredToolIds } from '@/lib/tool-register';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel-specific: bump the function timeout. Hobby caps at 10s anyway;
// Pro/Enterprise honor this. A typical visitor turn finishes in 2-5s,
// but tool-loop iterations can stack: 8 iterations × 3s LLM call +
// ticket-destination round-trip = up to ~30s.
export const maxDuration = 60;

// In-memory cache of the deployment's registered tool ids. Pulled once
// per worker boot from Supabase (the source of truth — populated by
// ensureToolsRegistered on first admin load) and reused. Listing on
// every request would waste a query for a value that rarely changes.
let toolIdsCache: { ids: string[]; loadedAt: number } | null = null;
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

async function getToolIds(): Promise<string[]> {
  const now = Date.now();
  if (toolIdsCache && now - toolIdsCache.loadedAt < TOOL_CACHE_TTL_MS) {
    return toolIdsCache.ids;
  }
  try {
    const ids = await getRegisteredToolIds();
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
  // Bail early if the deploy isn't fully configured — the chat UI's
  // input bar shows this `error` field as a flash message instead of
  // a stack trace.
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: 'setup_incomplete',
        detail: `Customerdog isn't fully configured. Missing env: ${missing
          .map((m) => m.name)
          .join(', ')}. Visit / for setup instructions.`,
      },
      { status: 503 },
    );
  }

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

  // Always try streaming first. qlaud accepts `stream: true` with
  // tools attached on newer accounts; if this account / endpoint
  // version still rejects the combo with a 400 ("streaming + tools
  // combo"), we fall back to a single-shot non-streaming call. The
  // chat client (input-bar.tsx) handles both content-types.
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

  // Fall-back path: qlaud rejected stream + tools.
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    const looksLikeStreamToolsBlock =
      upstream.status === 400 &&
      tools.length > 0 &&
      /stream/i.test(detail) &&
      /tool/i.test(detail);

    if (looksLikeStreamToolsBlock) {
      try {
        const result = await qlaud.sendMessage({
          threadId,
          body: requestBody,
        });
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

    return NextResponse.json(
      { error: `upstream ${upstream.status}`, detail: detail.slice(0, 500) },
      { status: errStatus(upstream.status) },
    );
  }

  if (!upstream.body) {
    return NextResponse.json(
      { error: 'upstream returned empty body' },
      { status: 502 },
    );
  }

  // qlaud accepted streaming. Pass it through verbatim — including
  // any tool_dispatch_* events the client already knows how to render.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-qlaud-thread-id':
        upstream.headers.get('x-qlaud-thread-id') ?? threadId,
    },
  });
}

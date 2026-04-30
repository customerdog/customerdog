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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel-specific: bump the function timeout. Hobby caps at 10s anyway;
// Pro/Enterprise honor this. Tool-loop iterations during streaming can
// stack — 8 iterations × 3s LLM call + ticket-destination round-trip
// adds up to ~30s in the worst case.
export const maxDuration = 60;

// POST /api/chat
//
// Body: { message: string }
//
// Anonymous flow:
//   1. Read cd_visitor cookie (mint if missing) — used as qlaud's
//      end_user_id so the same visitor's threads stay correlated.
//   2. Read cd_thread cookie. If missing, create a new qlaud thread
//      and a `conversations` row in Supabase, then set the cookie.
//   3. Assemble the system prompt from the KB. Send to qlaud as a
//      structured message with cache_control: ephemeral — Anthropic's
//      prompt cache eats the cost on every subsequent turn.
//   4. Stream the SSE response back to the browser verbatim — qlaud
//      multiplexes tool dispatch into the same stream via
//      `qlaud.tool_dispatch_*` events, parsed by lib/qlaud-stream.ts.
//
// Tool exposure: tools_mode='dynamic' (also the default when no tools
// array is passed). Per qlaud's /v1/threads docs:
//   "model gets 4 meta-tools, auto-discovers + dispatches anything in
//    the catalog"
// so the AI sees:
//   - Custom webhooks we registered (create_ticket, send_email_to_user
//     in tool_registrations)
//   - Any qlaud built-in the operator enabled in their dashboard
//     (qlaud-builtin/send-email, /linear, /zendesk, etc.)
//   - Any MCP server they connected (/v1/mcp-servers + /v1/mcp-catalog)
// All of them appear via the same `qlaud_search_tools` meta-tool when
// the model needs one — no per-request enumeration required from us.
//
// Streaming + tool dispatch is supported across every model family
// (ref: docs.qlaud.ai/api-reference/threads "Streaming + tools —
// supported models"). One SSE connection carries both content_block_*
// events AND qlaud.tool_dispatch_* events; client renders inline.
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

  let systemText: string;
  try {
    const sys = await getSystemPrompt();
    systemText = sys.text;
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
  //
  // tools_mode: 'dynamic' is qlaud's default when no `tools` array is
  // passed; setting it explicitly makes the contract obvious. The AI
  // gets 4 meta-tools (qlaud_search_tools, qlaud_manage_connections,
  // qlaud_call_tool, qlaud_get_tool_schema) and uses them to discover
  // + invoke any registered tool — our custom webhooks + qlaud
  // built-ins + connected MCP servers all surface through the same
  // discovery flow.
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
    tools_mode: 'dynamic',
  };

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

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
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

  // Pass the SSE through verbatim — qlaud's stream includes any
  // tool_dispatch_* events the client already knows how to render
  // when the AI auto-calls a registered tool mid-stream.
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

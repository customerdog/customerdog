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
// Tool exposure: tools_mode='tenant'. Per qlaud's tools-modes reference,
// tenant mode "sends every tenant-shared tool you've registered to the
// model, every turn, with no setup per request" — ideal for company-
// internal agents and support bots, exactly our case.
//
// What this means in practice:
//   - The OPERATOR controls which tools the AI can call by going to
//     the qlaud dashboard and marking them as tenant-shared. That
//     applies to all three tool kinds: custom webhooks (our
//     create_ticket / send_email_to_user), qlaud built-ins (Resend,
//     Slack, Linear, etc.), and MCP servers (Stripe, GitHub, …).
//   - customerdog's chat handler doesn't enumerate tools per-request.
//     We send `tools_mode: "tenant"` and qlaud injects whichever
//     tools the operator has marked shared at dashboard level.
//   - vs. dynamic mode: tenant skips the meta-tool discovery round-
//     trip — the model sees the actual tools immediately. Lower
//     latency + lower token overhead for known support workflows.
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
  // tools_mode: 'tenant' — qlaud auto-attaches every tool the operator
  // marked as tenant-shared in their qlaud dashboard. The AI sees them
  // directly (no meta-tool discovery hop), can call them mid-stream,
  // dispatch results flow back through qlaud.tool_dispatch_* SSE events.
  //
  // Model: defaults to claude-haiku-4-5 — for KB-grounded support
  // chat, Haiku is roughly 3× cheaper than Sonnet, has higher per-
  // minute rate-limit headroom on every Anthropic tier, and keeps the
  // Anthropic prompt cache (cache_control below) so the bulk of the
  // KB cost lands once per turn, not once per token. Operators can
  // override via QLAUD_MODEL env (any model qlaud routes to —
  // claude-*, gpt-*, gemini-*, deepseek-*, mistral-*, etc.).
  const requestBody: Record<string, unknown> = {
    model: process.env.QLAUD_MODEL ?? 'claude-haiku-4-5',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    content: message,
    tools_mode: 'tenant',
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

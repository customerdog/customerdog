import 'server-only';
import { env } from './env';

// Typed wrapper over the qlaud REST API. Single source of truth for all
// qlaud calls in the app — handlers and server components import from
// here and don't touch fetch() directly.
//
// SECURITY: this module is server-only. The `import 'server-only'` line
// at the top makes Next.js refuse to bundle it for the browser — any
// client component that imports the runtime `qlaud` object (instead of
// just types) will fail the build.
//
// Auth model: ONE key per deployment. customerdog is single-tenant per
// clone — the company that deployed it is the qlaud account. We use
// QLAUD_KEY for everything: chat (threads + messages) AND admin ops
// (tools registration). Operators who care about blast radius can
// split this into two keys later.
//
// Tool exposure model (tenant mode):
//   - Chat requests send `tools_mode: "tenant"`. qlaud auto-attaches
//     every tool the operator marked as tenant-shared in their qlaud
//     dashboard. No per-request enumeration; no meta-tool discovery
//     hop; the model sees the live tools immediately.
//   - Eligible tools span all three qlaud kinds, all interchangeable
//     from the model's perspective:
//       1. Custom webhooks (POST /v1/tools)              — what we ship
//       2. Built-ins   (POST /v1/builtins, e.g. Resend)  — operator-enabled
//       3. MCP servers (POST /v1/mcp-servers, custom URL or catalog)
//   - Operator workflow: customerdog auto-registers create_ticket and
//     send_email_to_user as webhooks on first admin load, but the
//     operator must visit the qlaud dashboard once to mark them (or
//     any other catalog tools they want) as tenant-shared. After that,
//     every chat turn includes them automatically.
//   - Streaming + tool dispatch coexist on a single SSE; lib/qlaud-stream
//     parses both standard Anthropic events and qlaud.* side-channel
//     events.

const BASE = () => env.QLAUD_BASE_URL();
const KEY = () => env.QLAUD_KEY();

type Json = Record<string, unknown>;

async function call<T = Json>(
  path: string,
  init: RequestInit & { apiKey?: string } = {},
): Promise<T> {
  const apiKey = init.apiKey ?? KEY();
  const headers = new Headers(init.headers);
  headers.set('x-api-key', apiKey);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${BASE()}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new QlaudError(res.status, `${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export class QlaudError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'QlaudError';
  }
}

// ─── Types ──────────────────────────────────────────────────────────────

export type Thread = {
  id: string;
  object: 'thread';
  end_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
  last_active_at: number;
};

export type ThreadMessage = {
  seq: number;
  role: 'user' | 'assistant';
  content: unknown;
  request_id: string | null;
  created_at: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  webhook_url: string;
  timeout_ms?: number;
};

type ToolRegisterResult = ToolDefinition & {
  id: string;
  secret: string; // returned ONCE
};

// ─── API surface ────────────────────────────────────────────────────────

export const qlaud = {
  /** POST /v1/threads — create a new conversation tagged with the
   *  visitor's anonymous id (passed as Anthropic's end_user_id). */
  createThread: (args: {
    endUserId?: string;
    metadata?: Record<string, unknown>;
  } = {}) =>
    call<Thread>('/v1/threads', {
      method: 'POST',
      body: JSON.stringify({
        end_user_id: args.endUserId,
        metadata: args.metadata,
      }),
    }),

  /** GET /v1/threads/:id/messages — paginated message list, used by
   *  /admin/conversations to render past transcripts on demand. */
  listThreadMessages: (args: {
    threadId: string;
    limit?: number;
    order?: 'asc' | 'desc';
    afterSeq?: number | null;
    beforeSeq?: number | null;
  }) => {
    const url = new URL(`${BASE()}/v1/threads/${args.threadId}/messages`);
    url.searchParams.set('limit', String(args.limit ?? 100));
    if (args.order) url.searchParams.set('order', args.order);
    if (args.afterSeq != null) url.searchParams.set('after_seq', String(args.afterSeq));
    if (args.beforeSeq != null) url.searchParams.set('before_seq', String(args.beforeSeq));
    return fetch(url, { headers: { 'x-api-key': KEY() } }).then(async (r) => {
      if (!r.ok) {
        throw new QlaudError(r.status, `listThreadMessages → ${r.status}`);
      }
      return (await r.json()) as {
        object: 'list';
        data: ThreadMessage[];
        has_more: boolean;
        next_after_seq: number | null;
        next_before_seq: number | null;
      };
    });
  },

  /** POST /v1/threads/:id/messages — STREAMING (when no tools) or
   *  non-streaming (when tools attached, since qlaud doesn't allow
   *  stream + tools together yet).
   *
   *  Returns the raw upstream Response so the chat handler can pipe
   *  `body` straight back to its own client without re-buffering.
   */
  streamMessage: async (args: {
    threadId: string;
    body: Record<string, unknown>;
  }): Promise<Response> => {
    return fetch(`${BASE()}/v1/threads/${args.threadId}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': KEY(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...args.body, stream: true }),
    });
  },

  /** POST /v1/threads/:id/messages — non-streaming variant. Used when
   *  tools are attached (qlaud streams + tools combo isn't supported). */
  sendMessage: (args: {
    threadId: string;
    body: Record<string, unknown>;
  }) =>
    call<{
      id: string;
      role: 'assistant';
      content: unknown[];
      stop_reason: string;
    }>(`/v1/threads/${args.threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify(args.body),
    }),

  /** POST /v1/tools — register a tool. Used by scripts/register-tools.ts
   *  after first deploy. */
  registerTool: (def: ToolDefinition) =>
    call<ToolRegisterResult>('/v1/tools', {
      method: 'POST',
      body: JSON.stringify(def),
    }),

  /** GET /v1/tools — list registered tools. Chat handler caches the ids
   *  per worker boot. */
  listTools: () =>
    call<{ object: 'list'; data: Array<ToolRegisterResult> }>('/v1/tools'),
};

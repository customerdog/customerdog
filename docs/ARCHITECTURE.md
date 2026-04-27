# chatai — architecture

One page. Two managed services held together by ~500 lines of Next.js
glue. No database to provision.

## The two moving parts

```
   ┌──────────────────────┐         ┌────────┐
   │ Clerk                │         │ qlaud  │
   │   - auth/sessions    │         │  (AI)  │
   │   - per-user state   │         │        │
   │     in privateMeta   │         │        │
   └──────────┬───────────┘         └───┬────┘
              │                          │
              │ user.created webhook    │ /v1/keys
              │                          │ /v1/threads
              │                          │ /v1/tools
              │                          │ /v1/search
              ▼                          ▼
   ┌─────────────────────────────────────────────┐
   │      Next.js 15 (App Router) — chatai       │
   └─────────────────────────────────────────────┘
```

- **Clerk** owns identity + sessions AND per-user state. The Clerk user
  record's `privateMetadata` (~8KB per user, server-only) holds the
  qlaud key id + secret + initial thread id we mint at signup. We never
  touch passwords or JWTs directly — `clerkMiddleware` gates `/chat/*`
  and `auth()` returns the current `userId` in server handlers.
- **qlaud** owns everything AI-shaped: per-user keys with spend caps,
  thread persistence, tool dispatch loop, semantic search.

Why no separate database? Because the only persistent state we own per
user is three short strings (`qlaud_key_id`, `qlaud_secret`,
`qlaud_initial_thread_id`). Spinning up Postgres + RLS + migrations to
hold that is theatre — Clerk already has a record per user; we just bolt
the strings onto it.

## Onboarding pipeline

```
new user signs up via Clerk
      │
      ▼
Clerk fires user.created webhook → POST /api/webhooks/clerk
      │  (svix-verified)
      ▼
1. mint qlaud key with $5 cap (qlaud.mintKey)
2. create initial thread tagged with end_user_id (qlaud.createThread)
3. clerkClient.users.updateUserMetadata(userId, {
     privateMetadata: { qlaud_key_id, qlaud_secret,
                        qlaud_initial_thread_id }
   })
      │
      ▼
user redirected to /chat → /chat/[initial-thread-id]
```

The whole pipeline is **~70 lines** in
[`src/app/api/webhooks/clerk/route.ts`](../src/app/api/webhooks/clerk/route.ts).
Idempotent on Clerk re-delivery: we check `privateMetadata.qlaud_secret`
before minting a second key.

## The chat turn

```
user types in InputBar
      │
      ▼  POST /api/chat { threadId, message }
Next.js handler (src/app/api/chat/route.ts):
   - look up qlaud key from Clerk privateMetadata (60s in-memory cache)
   - call qlaud.streamMessage with all registered tools attached
   - pipe upstream Response.body straight to the browser (no buffering)
      │
      ▼  text/event-stream (Anthropic-shape SSE)
parseChatStream (lib/qlaud-stream.ts) yields typed events:
   text_delta, thinking_delta, tool_use_start, tool_use_input_delta,
   content_block_stop, message_stop
      │
      ▼
InputBar mutates an in-progress assistant message; ChatShell re-renders
on every delta. MessageStream walks the content blocks and renders text
(Markdown), thinking (collapsible), and tool_use (ToolExecution card).
```

## The tool loop (qlaud-side, transparent to us)

When the assistant emits a `tool_use` block:

```
qlaud sees tool_use → POST <webhook_url> signed with HMAC-SHA256
                      payload: { tool_id, tool_use_id, name, input,
                                 request_id, thread_id, end_user_id }
                            │
                            ▼
              chatai handler (src/app/api/tools/<name>/route.ts):
                 1. verify HMAC (lib/tools/verify-signature.ts)
                 2. parse + validate input (zod)
                 3. run the business logic
                 4. respond { output: any } or { output, is_error: true }
                            │
                            ▼
qlaud appends tool_result → re-calls assistant → loops up to 8 times
```

We never write the dispatch loop. Parallel `tool_use` blocks fan out
in parallel (qlaud does `Promise.all`). Retries (3× exp-backoff on 5xx)
and the iteration cap are qlaud's job.

## Search

`/v1/search` is a single GET with `?q=…&end_user_id=<clerk_id>`. qlaud
embeds the query, hits its own Vectorize index over the user's threads,
returns ranked snippets with `thread_id` + `seq`. We embed nothing.
Index nothing. The whole feature is a 25-line route + a 70-line sidebar
component.

## What we never built

- Database (no Supabase, no Postgres, no migrations, no RLS policies)
- Messages table, schema, retention policy
- Context-window assembly (truncating old messages, sliding window)
- Tool-call state machine (the "model wants tool X, run it, send back
  result, model wants tool Y, …" loop)
- Embedding pipeline (no OpenAI embeddings call, no batch job)
- Vector store (no Pinecone / pgvector / Weaviate to provision)
- Per-user usage attribution (the spend cap on the per-user key is the
  attribution; pull `/v1/usage` rolled up by `key_id` at month-end)
- Webhook signature verification *for the AI vendor* — qlaud signs the
  outbound tool dispatches with one secret per tool

The result: **a fork-and-deploy demo that ships in a day** instead of a
quarter.

## File map

```
src/
  middleware.ts                  Clerk gating
  app/
    layout.tsx                   ClerkProvider + Inter font
    page.tsx                     Marketing landing
    chat/
      page.tsx                   Picks latest thread, redirects
      [threadId]/page.tsx        Server-loads history + renders shell
    api/
      webhooks/clerk/route.ts    user.created → mint + thread + privateMeta
      chat/route.ts              SSE proxy to qlaud
      threads/route.ts           list + create
      threads/[id]/route.ts      single thread history
      search/route.ts            /v1/search proxy
      tools/
        web-search/route.ts      DuckDuckGo, signed
        generate-image/route.ts  pollinations.ai, signed
  lib/
    env.ts                       typed env access
    qlaud.ts                     typed REST client
    qlaud-stream.ts              SSE → typed events
    user-state.ts                Clerk privateMetadata get/set + cache
    tools/definitions.ts         the tool defs (single source of truth)
    tools/verify-signature.ts    HMAC verifier
  components/chat/
    chat-shell.tsx               sidebar + main pane
    thread-list.tsx              sidebar
    search-bar.tsx               semantic search box
    message-stream.tsx           message renderer
    input-bar.tsx                composer + SSE consumer
    markdown.tsx                 react-markdown wrapper
    thinking-block.tsx           collapsible
    tool-execution.tsx           tool_use + tool_result card
    streaming-cursor.tsx         blinking cursor
scripts/
  check-env.ts                   live-probe Clerk + qlaud creds
  register-tools.ts              one-shot tool registration
```

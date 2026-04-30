# customerdog — architecture

One page. Two managed services + the Next.js app.

## The three moving parts

```
   ┌────────────────────────────┐    ┌─────────────────────┐
   │ qlaud                      │    │ Supabase (Postgres) │
   │  - threads + messages      │    │  - config           │
   │  - tools_mode='tenant'     │    │  - kb_sources       │
   │    auto-attaches operator- │    │  - conversations    │
   │    shared tools            │    │                     │
   │  - tool dispatch loop      │    │                     │
   │  - prompt cache passthrough│    │                     │
   │  - per-end-user tag        │    │                     │
   │  - tool execution logs     │    │                     │
   │    at /v1/usage            │    │                     │
   └─────────────┬──────────────┘    └──────────┬──────────┘
                 │                              │
                 │  POST /v1/threads            │  REST /
                 │  POST /v1/threads/:id/messages│  service-role
                 │  GET  /v1/threads/:id/messages│  key  +  pg
                 │                              │  (migration only)
                 ▼                              ▼
   ┌─────────────────────────────────────────────────────┐
   │      Next.js 15 (App Router) — customerdog          │
   │                                                     │
   │   Visitor (no auth):                                │
   │     /              — landing                        │
   │     /chat          — full-page chat                 │
   │     /embed         — iframe-friendly chat           │
   │     /widget.js     — bubble bootstrap (public/)     │
   │     /api/chat      — SSE streaming endpoint         │
   │                                                     │
   │   Admin (cd_admin signed cookie):                   │
   │     /admin/login   — single-password form           │
   │     /admin         — dashboard                      │
   │     /admin/kb      — KB management + crawl          │
   │     /admin/conversations + [id]                     │
   │     /admin/settings                                 │
   │     /admin/embed   — snippet generator              │
   │     /admin/setup   — manual schema-install fallback │
   └─────────────────────────────────────────────────────┘
```

Tools are configured at qlaud.ai/tools (Catalog built-ins, MCP servers,
or custom webhooks) — customerdog has zero `/api/tools/*` routes of its
own.

## Data flow: a visitor turn

1. Visitor types a message → POST `/api/chat { message }`.
2. Server reads `cd_visitor` cookie (mints `anon_<uuid>` if missing).
3. Server reads `cd_thread` cookie. If missing:
   - `qlaud.createThread({ endUserId: visitorId })`
   - `INSERT INTO conversations (anon_visitor_id, qlaud_thread_id)`
   - Set `cd_thread` cookie (30-day max-age).
4. Server assembles system prompt: `getConfig()` + active KB sources
   from Supabase, concatenated. Wrapped in
   `[{ type: 'text', text: <kb>, cache_control: { type: 'ephemeral' } }]`
   so Anthropic's prompt cache eats subsequent turns (~10% the cost
   of the first turn).
5. POST to `qlaud /v1/threads/<id>/messages` with
   `{ system, content, stream: true, tools_mode: 'tenant' }`.
6. qlaud auto-attaches every tenant-shared tool from the operator's
   account catalog and starts streaming.
7. If the AI calls a tool mid-stream:
   - qlaud dispatches it (built-in handler / MCP server / custom
     webhook URL — operator's choice when registering at qlaud's
     dashboard) and streams `qlaud.tool_dispatch_*` events back into
     the same SSE.
   - Customerdog's chat handler is uninvolved; it just forwards the
     SSE bytes to the browser.
8. Streaming response continues from where it left off, including the
   AI's response after the tool result returns.

## Storage: minimal Supabase footprint

| Lives in qlaud | Lives in Supabase |
|---|---|
| Conversation transcripts | Knowledge base (kb_sources) |
| Per-message metadata | Config (single row) |
| Tool definitions, secrets, dispatch state | Conversations metadata (anon_visitor_id, qlaud_thread_id, started_at, …) |
| Tool execution audit (`/v1/usage`) | — |

Result: Supabase outages degrade admin UX (no transcripts list, no KB
edits, no settings changes) but don't break visitor chat — the
conversation lives on qlaud's side and the system prompt assembly
times out gracefully. KB writes happen via the admin pages so a
stale-by-a-few-seconds prompt is the worst case.

qlaud outages do break visitor chat (no thread to write to), but the
visitor sees a clean error from `/api/chat` rather than a stack
trace.

## Why this shape

- **Anonymous-first**: most support visitors are unauthenticated. We
  don't make them sign in.
- **One key per deploy**: the company that cloned the repo is the
  qlaud account. No per-user key minting; `end_user_id` keeps
  visitors' threads distinct on qlaud's side.
- **KB as system prompt**: avoids running our own embedding pipeline.
  Anthropic's prompt cache makes long context cheap. A typical B2B
  SaaS knowledge base (20–80K tokens) fits comfortably; bigger KBs
  may want to chunk + retrieve, future work.
- **Single-tenant**: fork = one company. No tenant isolation logic,
  no row-level security, no Clerk Organizations.
- **qlaud owns tools**: customerdog ships chat surface + KB + admin
  UI. qlaud ships the agent runtime. Clean responsibility split — when
  qlaud adds a built-in (Resend, GitHub, etc.) or accepts a new MCP
  server, our operators get it for free with no code change.
- **Admin password gate**: the deploying company sets a password in
  env. No third-party auth dep for admins.

## Schema migration

`requireSchema()` (`src/lib/admin-guard.ts`) probes the latest table
on every admin page render. If missing:

1. **Auto-migrate path** — if `DATABASE_URL` is set, opens a direct
   Postgres connection (`pg`), checks `information_schema.tables`,
   and runs `supabase/schema.sql` for any missing tables. Idempotent
   (`CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`).
2. **Manual fallback** — if `DATABASE_URL` is unset or the migration
   fails, redirects to `/admin/setup` which renders the SQL with a
   "copy" button + a deep-link to the operator's Supabase SQL Editor.

`/admin/setup` also runs the auto-migrate before showing the manual
flow, so visiting it directly self-heals when possible.

## File map

```
src/
  app/
    page.tsx                   — visitor landing
    layout.tsx                 — root layout (no Clerk)
    globals.css                — light-mode design tokens
    chat/page.tsx              — full-page chat
    embed/page.tsx             — iframe chat (no chrome)
    api/chat/route.ts          — SSE chat endpoint (anonymous + cookied,
                                  tools_mode='tenant')
    admin/
      page.tsx                 — dashboard
      error.tsx                — admin error boundary with cause guessing
      login/                   — password form + server action
      kb/                      — knowledge base management + crawl
      settings/                — config row editor (4 fields)
      conversations/           — list + transcript view
      embed/                   — widget snippet generator
      setup/                   — manual schema-install fallback
  components/chat/             — ChatShell, MessageStream, InputBar, …
  components/setup-screen.tsx  — env-not-set screen used by visitor pages
  middleware.ts                — /admin/* signed-cookie gate
  lib/
    qlaud.ts                   — typed qlaud REST wrapper (createThread,
                                  streamMessage, listThreadMessages)
    qlaud-stream.ts            — SSE event parser (Anthropic + qlaud.*)
    supabase.ts                — Supabase client + Row types
    kb.ts                      — KB ingestion + system-prompt assembly
    kb-crawl.ts                — sitemap + same-origin link discovery
    html-extract.ts            — Mozilla Readability layered extractor
    html-to-text.ts            — regex-only fallback stripper
    anon-session.ts            — visitor cookie helpers (cd_visitor, cd_thread)
    admin-session.ts           — admin cookie sign/verify (Web Crypto)
    admin-guard.ts             — requireSchema / requireSetup
    auto-migrate.ts            — pg-based schema migrator (DATABASE_URL)
    schema-sql.ts              — reads supabase/schema.sql for /admin/setup
    setup-check.ts             — env presence check for visitor pages
    env.ts                     — typed env access (fail-fast)
public/
  widget.js                    — vanilla JS bubble bootstrap
supabase/
  schema.sql                   — config + kb_sources + conversations
scripts/
  check-env.ts                 — predev live env probes (npm run check)
```

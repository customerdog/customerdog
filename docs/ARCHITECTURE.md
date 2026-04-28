# customerdog — architecture

One page. Two managed services + the Next.js app.

## The three moving parts

```
   ┌──────────────────────┐    ┌─────────────────────┐
   │ qlaud                │    │ Supabase (Postgres) │
   │  - threads           │    │  - config           │
   │  - tool dispatch loop│    │  - kb_sources       │
   │  - prompt cache      │    │  - conversations    │
   │  - per-end-user tag  │    │  - actions          │
   └──────────┬───────────┘    └──────────┬──────────┘
              │  /v1/threads             │ REST /
              │  /v1/messages            │ service-role
              │  /v1/tools               │ key
              ▼                          ▼
   ┌─────────────────────────────────────────────┐
   │      Next.js 15 (App Router) — customerdog  │
   │                                             │
   │   Visitor (no auth):                        │
   │     /            — landing                  │
   │     /chat        — full-page chat           │
   │     /embed       — iframe-friendly chat     │
   │     /widget.js   — bubble bootstrap         │
   │     /api/chat    — SSE streaming endpoint   │
   │                                             │
   │   Admin (cd_admin signed cookie):           │
   │     /admin/login   — single-password form   │
   │     /admin/kb      — KB management          │
   │     /admin/conversations + [id]             │
   │     /admin/activity                         │
   │     /admin/settings                         │
   │     /admin/embed   — snippet generator      │
   │                                             │
   │   Tools (HMAC-signed, called by qlaud):     │
   │     /api/tools/create-ticket                │
   │     /api/tools/send-email                   │
   └─────────────────────────────────────────────┘
```

## Data flow: a visitor turn

1. Visitor types a message → POST `/api/chat { message }`.
2. Server reads `cd_visitor` cookie (mints if missing — opaque UUID).
3. Server reads `cd_thread` cookie. If missing:
   - `qlaud.createThread({ endUserId: visitorId })`
   - `INSERT INTO conversations (anon_visitor_id, qlaud_thread_id)`
   - Set `cd_thread` cookie (30-day max-age).
4. Server assembles system prompt: `getConfig()` + `listActiveSources()` from Supabase, concatenated. Wrapped in `{ type: 'text', cache_control: { type: 'ephemeral' } }` so Anthropic's prompt cache eats subsequent turns.
5. POST to `qlaud /v1/threads/<id>/messages` with `{ system, content, tools }`.
6. Toolless: stream the SSE response straight back to the browser.
   With tools: non-streaming round trip (qlaud doesn't allow stream + tools).
7. If the AI calls `create_ticket` or `send_email_to_user`:
   - qlaud POSTs to our tool webhook, HMAC-signed.
   - Webhook validates input (zod), enforces contact policy, dispatches to the configured destination (email/Slack/Linear/Zendesk), inserts a row into `actions`.
   - Webhook returns `{ output }` to qlaud, which feeds it back into the model.
8. Streaming response continues from where it left off.

## Storage: nothing chat-critical lives in Supabase

| Lives in qlaud | Lives in Supabase |
|---|---|
| Conversation transcripts | Knowledge base |
| Per-message metadata | Config (single row) |
| Tool-use blocks | Conversations metadata (visitor id, contact info) |
|  | Actions (audit log) |

Result: Supabase outages degrade admin UX (no transcripts, no audit log writes) but don't break visitor chat — the conversation stays alive on qlaud's side and resumes on next message. KB writes happen out-of-band so a stale system prompt is the worst case.

## Why this shape

- **Anonymous-first**: most support visitors are unauthenticated. We don't make them sign in.
- **One key per deploy**: the company that cloned the repo is the qlaud account. No per-user key minting; `end_user_id` is enough to keep visitors' conversations distinct on qlaud's side.
- **KB as system prompt**: avoids running our own embedding pipeline. Anthropic's prompt cache makes long context cheap. A typical B2B SaaS knowledge base (20-80K tokens) fits comfortably; bigger KBs may want to chunk + retrieve, future work.
- **Single-tenant**: fork = one company. No tenant isolation logic, no row-level security, no Clerk Organizations. Companies that want multi-tenant SaaS can build it on top.
- **Admin password gate**: the deploying company sets a password in env. No third-party auth dep for admins. Multi-admin/SSO swap-in is straightforward (drop in Clerk in middleware) but unnecessary at MVP.

## File map

```
src/
  app/
    page.tsx                   — visitor landing
    chat/page.tsx              — full-page chat
    embed/page.tsx             — iframe chat
    api/chat/route.ts          — SSE chat endpoint (anonymous + cookied)
    api/tools/
      create-ticket/route.ts   — escalation tool webhook
      send-email/route.ts      — email tool webhook
    admin/
      login/                   — password form + server action
      kb/                      — knowledge base management
      settings/                — config row editor
      conversations/           — list + transcript view
      activity/                — audit log
      embed/                   — snippet generator
  components/chat/             — ChatShell, MessageStream, InputBar, …
  lib/
    qlaud.ts                   — typed qlaud REST wrapper
    supabase.ts                — typed Supabase client + row types
    kb.ts                      — KB ingestion + system-prompt assembly
    activity.ts                — audit log writes
    anon-session.ts            — visitor cookie helpers
    admin-session.ts           — admin cookie sign/verify (Web Crypto)
    destinations/              — email / slack / linear / zendesk
    tools/
      definitions.ts           — qlaud tool registration source-of-truth
      verify-signature.ts      — HMAC verifier for tool webhooks
    env.ts                     — typed env access (fail-fast)
    html-to-text.ts            — KB URL parser
  middleware.ts                — /admin/* signed-cookie gate
public/
  widget.js                    — vanilla JS bubble bootstrap
supabase/
  schema.sql                   — one-time setup (idempotent)
scripts/
  check-env.ts                 — predev live env probes
  register-tools.ts            — one-shot post-deploy tool register
```

# chatai — open-source Next.js demo app on qlaud

## Context

A full-quality, production-ready chat product built on top of qlaud as the
canonical demo of "what you can ship in a weekend with our substrate."
Open-sourced at **github.com/qlaudAI/chatai** so any developer can fork,
swap three env-var sets (Clerk + Supabase + qlaud), and deploy to Vercel
or Railway. The demo IS the marketing — the chat-app tutorial in our docs
becomes literal: a real, deployable, well-designed app.

UX inspiration: the Pokee Claw chat interface — clean sidebar, real-time
tool execution displayed inline, collapsible thinking blocks, artifact
previews (images/files), token-by-token message streaming, structured
responses (tables, code blocks), bottom input with attachment + model
picker.

## Strategic value

- **Proof of concept for prospects.** "How do I build X on qlaud?" is
  answered with a working repo + live demo, not just docs.
- **Forkable starter kit.** Vibecoders clone it, customize, ship a real
  product. Lowers time-to-first-value from "read docs + glue 6 services"
  to "fork + 3 env vars + deploy."
- **Documents the integration patterns.** Real code beats hypothetical
  examples — the codebase IS the reference for how Clerk + Supabase +
  qlaud fit together.
- **Drives adoption of substrate features.** Threads, tools, search,
  streaming all visibly used in the demo.

## Tech stack — locked decisions

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 App Router** | What the user asked for; SSR, RSC, edge-friendly |
| Styling | **Tailwind CSS 4** + **shadcn/ui** | Matches qlaud dashboard for visual consistency; copy-paste components, no opinionated lib |
| Auth | **Clerk** | Already used by qlaud; same `@clerk/nextjs` pattern |
| App data | **Supabase** | User profiles, file uploads, app preferences. Postgres + Storage + RLS in one product |
| AI | **qlaud** | The whole point — threads + tools + search + streaming |
| Deployment | **Vercel-first**, Railway-compatible | Standard Next.js deploy targets; ship a one-click button |
| State | React Server Components + small client islands for streaming | Don't ship a global store unless we have to |
| Streaming | **Vercel AI SDK's `useChat`-style pattern**, but talking to qlaud | We adapt qlaud's SSE to the AI SDK's UIMessage shape so React UI feels native |

**Anti-decisions (don't drift):**
- Not bringing in Prisma — Supabase's typed client is enough.
- Not adding a state library (Zustand/Jotai). Server components hold
  state; client islands use `useState`/`useChat`.
- Not using OpenAI SDK / Anthropic SDK directly — everything goes via
  qlaud. The whole point is one base URL.

---

## Architecture

### Data ownership

```
Clerk         → user identity, sessions, sign-in UI
Supabase      → users table (Clerk webhook mirror), file_uploads,
                preferences, qlaud_secret per user
qlaud         → conversations (threads), messages, tools (registry),
                semantic search, billing, streaming
```

**Critical insight:** the chatai backend is mostly a thin orchestration
layer. It doesn't store messages. It doesn't run a vector DB. It doesn't
manage tool execution loops. All three live in qlaud.

### Onboarding flow

1. User signs up with Clerk
2. Clerk fires `user.created` webhook → `/api/webhooks/clerk`
3. Handler:
   - Mints a per-user qlaud key with `max_spend_usd: 5` cap (configurable)
   - Stores `qlaud_secret`, `qlaud_user_id` (= Clerk userId) in Supabase `users` row
   - Creates an initial qlaud thread tagged with `end_user_id: clerk_user_id`
4. User redirected to `/chat` → reads thread from Supabase, opens it

### Per-conversation flow

1. User types in input bar → POST `/api/chat`
2. API route:
   - Looks up `qlaud_secret` from Supabase by Clerk userId
   - Forwards to qlaud `/v1/threads/:id/messages` with `stream: true`
   - Pipes the SSE stream back to the client
3. Client renders chunks as they arrive (text deltas, tool_use blocks,
   tool_result blocks), updating the message UI in real time
4. After stream closes, qlaud has already persisted both turns and embedded
   for search — frontend doesn't have to do anything

### Tools

Tools registered ONCE on first deploy via a setup script. Each tool's
`webhook_url` points to a Next.js route handler in `/api/tools/*`.

When the assistant emits `tool_use`, qlaud calls the route, which:
- Verifies HMAC-SHA256 signature using `QLAUD_TOOL_SECRET_*` env var
- Runs the actual logic (web search, image gen, etc.)
- Returns `{ output }`

The frontend SEES the tool_use + tool_result blocks in the SSE stream
and renders them as nicely-styled "Tool execution" cards (matching the
Pokee Claw UI inspiration).

---

## v1 tool set (3 tools — keeps scope tight)

1. **`web_search`** — POST to qlaud's Perplexity passthrough, return citations
2. **`generate_image`** — POST to qlaud's `/v1/images/generations`, return image URL/data
3. **`save_to_drive`** — Uploads the assistant's response to Supabase Storage as a markdown file (proves Supabase integration; "Drive" is metaphorical here, real Drive needs OAuth)

Skip for v1.1: send_email (needs Resend setup), Stripe charge tool, code execution (needs sandboxes).

---

## File structure

```
chatai/
├── README.md              ← Setup + Vercel deploy button + screenshots
├── LICENSE                ← MIT
├── .env.example           ← Every env var, with comments
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json        ← shadcn config
├── docs/
│   ├── PLAN.md            ← This plan, copied in for reference
│   └── ARCHITECTURE.md    ← One-page ascii diagram of the data flow
├── supabase/
│   └── migrations/
│       └── 0001_users.sql ← users table mirroring Clerk + qlaud_secret
├── scripts/
│   └── register-tools.ts  ← Run once after deploy to register the 3 demo tools
├── public/
│   ├── favicon.ico
│   └── og.png
└── src/
    ├── middleware.ts                  ← Clerk middleware
    ├── app/
    │   ├── layout.tsx                 ← Root: ClerkProvider + theme
    │   ├── page.tsx                   ← Landing (links to sign-up + chat)
    │   ├── sign-in/[[...sign-in]]/page.tsx
    │   ├── sign-up/[[...sign-up]]/page.tsx
    │   ├── chat/
    │   │   ├── layout.tsx             ← Auth-gated, sidebar
    │   │   ├── page.tsx               ← Default — opens latest or creates new thread
    │   │   └── [threadId]/page.tsx    ← Specific conversation
    │   └── api/
    │       ├── webhooks/clerk/route.ts        ← Mint qlaud key on user.created
    │       ├── chat/route.ts                  ← Streaming proxy to qlaud
    │       ├── threads/route.ts               ← GET list / POST create
    │       ├── threads/[id]/route.ts          ← GET / DELETE
    │       ├── search/route.ts                ← Proxy to qlaud /v1/search
    │       └── tools/
    │           ├── web-search/route.ts
    │           ├── generate-image/route.ts
    │           └── save-to-drive/route.ts
    ├── components/
    │   ├── chat/
    │   │   ├── chat-shell.tsx         ← Main UI (sidebar + main pane)
    │   │   ├── thread-list.tsx        ← Sidebar — recent conversations
    │   │   ├── search-bar.tsx         ← Top — semantic search across threads
    │   │   ├── message-stream.tsx     ← Renders one assistant turn, handles all block types
    │   │   ├── thinking-block.tsx     ← Collapsible (reasoning_content)
    │   │   ├── tool-execution.tsx     ← Card rendering tool_use + tool_result pair
    │   │   ├── artifact-card.tsx      ← Image / file preview with download
    │   │   ├── markdown.tsx           ← react-markdown wrapper with shiki code highlighting
    │   │   ├── input-bar.tsx          ← Bottom — input + attachment + model picker + send
    │   │   └── streaming-cursor.tsx   ← Animated cursor while streaming
    │   ├── ui/                        ← shadcn components (button, input, card, etc.)
    │   └── theme-provider.tsx
    ├── lib/
    │   ├── qlaud.ts                   ← Typed wrapper over qlaud REST APIs
    │   ├── qlaud-stream.ts            ← SSE parser → typed events for the UI
    │   ├── supabase/
    │   │   ├── server.ts              ← Service-role client (Clerk webhook + tools)
    │   │   └── client.ts              ← Anon client (browser, RLS-enforced)
    │   ├── tools/
    │   │   ├── verify-signature.ts    ← Shared HMAC verifier
    │   │   └── definitions.ts         ← The 3 tool definitions (used by register-tools.ts)
    │   └── env.ts                     ← Typed env access with Zod validation
    └── types/
        └── chat.ts                    ← Domain types (Thread, Message, ToolExecution, etc.)
```

---

## Build order (so the new session ships in the right sequence)

### Phase 1 — Skeleton (~2h)

1. `pnpm create next-app@latest chatai --typescript --tailwind --app --no-src-dir=false --import-alias="@/*"` — base scaffold
2. `pnpm add @clerk/nextjs @supabase/supabase-js zod` — core deps
3. `pnpm dlx shadcn@latest init` — design system
4. Drop in `.env.example` with placeholders for all env vars
5. Wire `middleware.ts` for Clerk
6. Stub `/sign-in`, `/sign-up`, landing `/`, gated `/chat`
7. Confirm landing → sign-up → /chat redirect works locally

### Phase 2 — Onboarding pipeline (~3h)

1. Supabase migration `0001_users.sql`:
   ```sql
   create table users (
     clerk_user_id text primary key,
     email text not null,
     qlaud_key_id text not null,
     qlaud_secret text not null,
     qlaud_initial_thread_id text not null,
     created_at timestamptz default now()
   );
   alter table users enable row level security;
   create policy "users read own row" on users
     for select using (auth.jwt() ->> 'sub' = clerk_user_id);
   ```
2. `/api/webhooks/clerk/route.ts` — Svix-verified handler for `user.created`:
   - Mint qlaud key (POST `/v1/keys` with master key)
   - Create initial thread (POST `/v1/threads` with end_user_id)
   - Insert users row
3. `lib/qlaud.ts` — typed client: `mintKey`, `createThread`, `sendMessage`, `streamMessage`, `listThreads`, `search`, `registerTool`
4. Test: sign up via Clerk in dev → user row exists in Supabase → has qlaud_secret + thread_id

### Phase 3 — Chat UI core (~5h) — the meat

1. `chat-shell.tsx` — split layout (sidebar + main)
2. `thread-list.tsx` — fetches `GET /v1/threads?end_user_id=clerkId` server-side
3. `[threadId]/page.tsx` — server-renders the prior history (`GET /v1/threads/:id/messages`)
4. `input-bar.tsx` — controlled input + send button
5. `/api/chat/route.ts` — accepts `{thread_id, content, tools?}`, calls qlaud `stream:true`, pipes SSE response back as a `Response(readableStream)`
6. `qlaud-stream.ts` — parses Anthropic SSE, emits typed events: `MessageStart`, `TextDelta`, `ToolUseStart`, `ToolUseDelta`, `ToolUseStop`, `ThinkingDelta`, `MessageStop`
7. `message-stream.tsx` — `useChat`-style React component that opens an EventSource (or `fetch` ReadableStream), reduces events into renderable blocks
8. `markdown.tsx` — render markdown turns with shiki code highlighting
9. **Key UX: token-by-token streaming feels native.** Test by making the LLM count to 100 — should reveal smoothly.

### Phase 4 — Tool execution UX (~3h)

1. `lib/tools/definitions.ts` — declare the 3 demo tools with name/description/schema/webhook_url (template the URL from `process.env.NEXT_PUBLIC_APP_URL`)
2. `scripts/register-tools.ts` — node script that POSTs each definition to qlaud `/v1/tools`, prints the secrets to stdout for the operator to copy into env vars
3. `lib/tools/verify-signature.ts` — shared HMAC verifier used by all 3 routes
4. `/api/tools/web-search/route.ts` — verify sig → call qlaud's `/perplexity/sonar/...` passthrough → return `{output}`
5. `/api/tools/generate-image/route.ts` — verify sig → call qlaud's `/v1/images/generations` → return image URL
6. `/api/tools/save-to-drive/route.ts` — verify sig → write input to Supabase Storage → return public URL
7. `tool-execution.tsx` — renders a card with: tool icon + name, input JSON (collapsible), spinner while pending, output (text/image/JSON) when done
8. `artifact-card.tsx` — image preview + download button, matching the Pokee Claw "ESG_Executive_Summary_2026.png — 906.1 KB — View | Download" style

### Phase 5 — Search + thinking + polish (~3h)

1. `search-bar.tsx` (sidebar top) — debounced input, calls `/api/search`, renders hits as a dropdown list grouped by thread
2. `/api/search/route.ts` — proxy to qlaud `/v1/search?end_user_id=clerkId`
3. `thinking-block.tsx` — collapsible details element, default closed, shows reasoning_content from streaming events
4. Empty states: "No conversations yet — start one below"
5. Loading skeletons (shimmer matches shadcn aesthetic)
6. Dark mode toggle (shadcn theme-provider)
7. Keyboard shortcuts: ⌘+K = focus search, ⌘+Enter = send

### Phase 6 — Open-source ergonomics (~2h)

1. `README.md` with:
   - Hero: screenshot of the chat UI
   - One-click Vercel deploy button (URL: `https://vercel.com/new/clone?repository-url=...`)
   - "What it shows off" — 5 bullets (per-user threads, tools, search, streaming, billing)
   - Setup: 3 numbered steps (Clerk, Supabase, qlaud env vars)
   - "Run locally" — `pnpm i && pnpm dev`
   - "Customize" — point at `lib/tools/definitions.ts` for adding tools
2. `.env.example` with comments per variable + link to where to get each
3. `LICENSE` (MIT)
4. `docs/ARCHITECTURE.md` — ASCII diagram of the 3-service flow (1 page)
5. GitHub issue/PR templates so contributions land cleanly

### Phase 7 — Deploy (~1h)

1. Push to qlaudAI/chatai (repo created in advance, see below)
2. Vercel project: connect repo, add env vars, deploy
3. After first deploy: run `pnpm tsx scripts/register-tools.ts` from local machine pointed at the deployed URL → captures the 3 tool secrets → paste into Vercel env vars → redeploy
4. Live demo URL: `chatai.qlaud.ai` (CNAME → Vercel deployment) — optional
5. Add deploy URL to qlaud's marketing landing as a "see it live" link

**Total estimated build time: ~19 hours.** A focused 2-day sprint or a relaxed week.

---

## Required env vars (the contract for `.env.example`)

```bash
# Clerk — clerk.com → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...                          # for /api/webhooks/clerk

# Supabase — supabase.com → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...                        # service-role, server-only

# qlaud — qlaud.ai → /keys → mint a Master key
QLAUD_MASTER_KEY=qlk_live_...
QLAUD_TOOL_SECRET_WEB_SEARCH=wsk_...                    # printed by scripts/register-tools.ts
QLAUD_TOOL_SECRET_GENERATE_IMAGE=wsk_...
QLAUD_TOOL_SECRET_SAVE_TO_DRIVE=wsk_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000               # so tools register with correct webhook URL
```

---

## What it should LOOK like (UX checklist matching the inspiration)

- [ ] Sidebar pinned left with: app logo + thread list + search bar at top
- [ ] Thread list: each item shows first-line preview + last-active relative time
- [ ] Top bar: thread title + connection indicator (green dot) + actions menu
- [ ] Main pane: clean message column, max-width prose
- [ ] User messages: right-aligned bubble OR top-aligned with subtle gray background
- [ ] Assistant messages: full-width prose with markdown rendered cleanly
- [ ] Streaming cursor: blinking caret while text is arriving
- [ ] Thinking block: collapsible `<details>` styled like a card; collapsed by default
- [ ] Tool execution: card with tool icon + name, "Done ✓" badge when complete
- [ ] Artifacts (images/files): card with preview + filename + size + View / Download buttons
- [ ] Tables: rendered as actual HTML tables with proper borders
- [ ] Code blocks: shiki-highlighted, copy button on hover
- [ ] Bottom input: textarea + paperclip (attach) + @ (mention/tool) + model picker + send button
- [ ] Empty state when no chats yet — clear single CTA
- [ ] Dark mode that ACTUALLY looks good (not just inverted)

---

## Anti-goals (things the new session must NOT build in v1)

- **Multi-tenancy beyond Clerk Orgs** — single-org per user is fine for v1
- **Custom prompt engineering UI** — model just gets the user's literal message + tool definitions
- **Voice input/output** — text only
- **File upload as model input** — that's the `save-to-drive` tool's INVERSE; defer
- **Mobile app** — responsive web is enough
- **Self-hosted alternative to Clerk/Supabase** — they're the chosen primitives; future "swap in OSS auth" can come later
- **Billing UI in the demo** — the user can see qlaud's own dashboard for that
- **Subscription tiers** — qlaud's prepaid wallet is the billing model; no tiers
- **More than the 3 demo tools** — pattern is established; community can add more

---

## Verification (when this plan ever runs)

End-to-end flow that proves the demo is real:

1. Fresh clone → `pnpm install` → `pnpm dev` → visit localhost:3000
2. Click "Sign up" → Clerk modal → create account
3. Webhook fires → Supabase users row appears with `qlaud_secret` populated
4. Redirected to `/chat` → empty state visible → click "Start a conversation"
5. Type "What's the weather in San Francisco?" → assistant invokes the
   `web_search` tool (visible as a tool execution card) → returns weather
   → final message renders with text streaming token-by-token
6. Type "Generate an image of a corgi" → tool execution card for
   `generate_image` → image artifact appears with download button
7. Type "Save the last response to drive" → file artifact appears with link
   to Supabase Storage
8. Top-bar search "weather" → search-bar dropdown shows the SF weather
   conversation as a hit → click → opens that thread
9. Sign out → sign back in → conversations still there (qlaud persisted them)
10. Open qlaud dashboard → /usage → see the cost attributed to the new key

If all 10 work, the demo is production-ready.

---

## How to ship

The new session will:
1. `git clone git@github.com:qlaudAI/chatai.git`
2. Read `docs/PLAN.md` (this file copied in by the seed commit)
3. Execute Phase 1–7 in order
4. Push commits as it goes — the user can watch progress on GitHub
5. Final commit is the live deploy URL added to the README

The repo will be created (empty seed commit with README + LICENSE +
.gitignore + this plan as docs/PLAN.md) before this plan is handed off,
so the new session can push immediately without any GitHub setup friction.

---

## Future iterations (post-v1.1, not for the new session)

- File attachments in the input (PDF/image upload → vision-capable model)
- Voice input via Whisper through qlaud
- Multi-thread parallel chat (compare two models side-by-side)
- Custom tool registration UI (in-app, no script needed)
- Org/team support (Clerk Organizations + per-org qlaud account)
- Real Drive/Notion/Slack integrations
- Embedded analytics dashboard mirroring qlaud's /usage

# chatai

> Open-source, production-quality chat app built on **qlaud**, **Clerk**, and **Supabase**.
> Fork it, swap three env-var sets, deploy to Vercel.

## What it shows off

- **Per-user conversations** — each user has their own threads, no shared `messages` table you have to build
- **Tool integration** — the assistant calls real business logic (web search, image gen, file save) via webhooks; qlaud handles the entire dispatch loop
- **Semantic search** — search every past conversation with natural language; no vector DB to provision
- **Streaming UX** — text appears word-by-word, like every modern chat
- **Per-user billing** — hard spend caps enforced gateway-side; pull usage at month-end and bill how you want

What you DON'T build:
Postgres `messages` table, context-window loader, tool-call state machine,
embedding pipeline, vector store, conversation search, per-user cost
attribution. **~300–500 lines of glue per AI app, deleted.**

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Clerk |
| Data (users, files, app state) | Supabase |
| AI (threads, tools, search, streaming, billing) | qlaud |

## Quick start

```bash
# 1. Clone + install
git clone https://github.com/qlaudAI/chatai.git
cd chatai
npm install

# 2. Copy env template + fill in your three accounts:
#    - Clerk:    clerk.com → API Keys + Webhooks
#    - Supabase: supabase.com → Settings → API + Settings → Database (password)
#    - qlaud:    qlaud.ai/keys → Master key
cp .env.example .env.local
# (edit .env.local)

# 3. Verify your env actually works (live probes Supabase + qlaud)
npm run check

# 4. Apply Supabase migrations (uses pg over the direct DB connection,
#    no Supabase CLI required; verifies via REST after)
npm run db:push

# 5. Register the demo tools with qlaud (one-time, after your first deploy
#    so the webhook URLs point at your live host)
npm run register-tools

# 6. Dev — `npm run check` runs automatically as predev; if any required
#    env var is missing or wrong, dev refuses to start with a clear error.
npm run dev
```

### Required env vars

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | dashboard.clerk.com → API Keys |
| `CLERK_SECRET_KEY` | same |
| `CLERK_WEBHOOK_SECRET` | dashboard.clerk.com → Webhooks → endpoint pointed at `/api/webhooks/clerk` (subscribe `user.created`) |
| `NEXT_PUBLIC_SUPABASE_URL` | supabase.com/dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (look for `sb_publishable_…` or anon JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | same (look for `service_role` / `sb_secret_…` — bypasses RLS, server-only) |
| `SUPABASE_DB_PASSWORD` | supabase.com/dashboard → Settings → Database (only needed for `npm run db:push`) |
| `QLAUD_MASTER_KEY` | console.qlaud.ai/keys (mint with scope `admin`) |

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FqlaudAI%2Fchatai)

Or any other Next.js host (Railway, Cloudflare Pages with the Workers
adapter, Netlify, your own).

After your first deploy: re-run `npm run register-tools` against the
live `NEXT_PUBLIC_APP_URL` so the tool webhooks point at your live host,
copy the printed signing secrets into your env vars, redeploy.

## Adding a tool

Tools are defined in [`src/lib/tools/definitions.ts`](src/lib/tools/definitions.ts).
Add a new entry there + a corresponding route handler at
`src/app/api/tools/<your-tool>/route.ts`, then re-run the register script.
qlaud handles the dispatch loop, signature verification, retries, parallel
fan-out — your handler just runs the business logic and returns
`{ output: any }`.

## License

MIT. See [LICENSE](LICENSE).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (one-page diagram of how
Clerk + Supabase + qlaud fit together) and [docs/PLAN.md](docs/PLAN.md)
(the original build plan, kept in-tree as a reference).

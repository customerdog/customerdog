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
pnpm install

# 2. Copy env template + fill in your three accounts:
#    - Clerk:    clerk.com → API Keys
#    - Supabase: supabase.com → Project Settings → API
#    - qlaud:    qlaud.ai/keys → Master key
cp .env.example .env.local
# (edit .env.local)

# 3. Run Supabase migrations
pnpm supabase db push

# 4. Register the demo tools with qlaud (one-time after deploy)
pnpm tsx scripts/register-tools.ts

# 5. Dev
pnpm dev
```

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FqlaudAI%2Fchatai)

Or any other Next.js host (Railway, Cloudflare Pages with the Workers
adapter, Netlify, your own).

After your first deploy: re-run `pnpm tsx scripts/register-tools.ts` so
the tool webhooks point at your live URL, copy the printed signing
secrets into your env vars, redeploy.

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

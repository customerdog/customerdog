# customerdog

> **Open-source AI customer support agent.**
> Clone the repo, plug in two services (qlaud + Supabase), set a password, deploy. Your visitors chat anonymously with an AI that answers from your knowledge base and escalates to a human when it can't resolve.

🐕 Live demo: [your-deploy.vercel.app](#) · 📖 [Architecture](docs/ARCHITECTURE.md) · 🗺 [Roadmap](docs/PLAN.md)

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog&env=QLAUD_KEY,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,DATABASE_URL,ADMIN_PASSWORD,ADMIN_COOKIE_SECRET,NEXT_PUBLIC_APP_URL&envDescription=QLAUD_KEY%20from%20qlaud.ai%20%28admin%20scope%29.%20SUPABASE_URL%20%2B%20SUPABASE_SERVICE_ROLE_KEY%20from%20Settings%20%E2%86%92%20API%20Keys%20%28Secret%29.%20DATABASE_URL%20from%20Settings%20%E2%86%92%20Database%20%E2%86%92%20Transaction%20pooler%20%28port%206543%29%20so%20schema%20auto-runs%20on%20first%20deploy.%20ADMIN_PASSWORD%20%2B%20ADMIN_COOKIE_SECRET%3A%20use%20%60openssl%20rand%20-base64%2032%60%20for%20each.%20NEXT_PUBLIC_APP_URL%3A%20put%20a%20placeholder%2C%20update%20after%20first%20deploy.&envLink=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog%2Fblob%2Fmain%2F.env.example&project-name=customerdog&repository-name=customerdog)

The button opens Vercel's import flow with all seven required env vars pre-listed — Vercel walks you through entering each one before the first build, so a fresh deploy can't ship broken. After deploy, come back to your project's Environment Variables to update `NEXT_PUBLIC_APP_URL` from the placeholder to your real Vercel URL (or custom domain like `support.yourcompany.com`), and redeploy. The schema install + qlaud tool registration both happen automatically the first time you load `/admin/*` — no separate scripts to run.

**Before you click the button, you'll need:**

1. **A free Supabase project.** Create at [supabase.com](https://supabase.com). You don't have to run the schema yourself — `DATABASE_URL` (below) lets customerdog do it on first deploy. Grab three values: the **Project URL**, the **Secret API key** (Settings → API Keys → either tab works; see step 2 below), and the **Session pooler connection string** (Settings → Database → Connection string → **Session** pooler tab, port 5432).
2. **A qlaud key** with admin scope from [qlaud.ai/keys](https://qlaud.ai/keys).
3. **Two random secrets** for the admin cookie + password: run `openssl rand -base64 32` twice.

---

## What you get

- **Three visitor surfaces** — hosted page at `support.yourcompany.com/chat`, embeddable widget (`<script src="…/widget.js">`), or raw iframe at `/embed`.
- **Anonymous chat** — cookie-only sessions. Visitors don't sign up. Conversations correlate via `end_user_id` on qlaud's side.
- **Knowledge base as cached context** — admin pastes URLs (server fetches + parses) or markdown; the entire corpus is concatenated into the system prompt with `cache_control: ephemeral` so Anthropic's prompt cache makes long contexts cheap.
- **Configurable contact policy** — admin chooses whether the AI must collect email, phone, either, or none before escalating.
- **Four ticket destinations** — email (Resend), Slack (incoming webhook), Linear (issue), Zendesk (ticket).
- **Audit log + transcripts** — every email sent, ticket filed, contact captured shows up in `/admin/activity`. Past conversations browsable in `/admin/conversations`. Both also visible directly in the Supabase Table Editor for power users.
- **Single password admin** — no Clerk, no third-party auth. Set `ADMIN_PASSWORD` in env.
- **Single qlaud key** — no per-user key minting. One key per deployment, signed cookie holds the visitor's session.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| AI | [qlaud](https://qlaud.ai) — threads, tool dispatch loop, prompt cache passthrough |
| Storage | [Supabase](https://supabase.com) — Postgres + built-in Table Editor |
| Admin auth | Single shared password → signed HTTP-only cookie |
| Visitor session | HTTP-only cookie, anonymous UUID |
| Email | [Resend](https://resend.com) |
| Tickets | Email / Slack / Linear / Zendesk (admin picks one) |
| Widget | Plain `<script>` + iframe + postMessage (no build step on host site) |

## Setup, step by step

Each step is a single block to copy-paste. Run them in order. ~15 minutes from scratch.

### 1. Clone + install

```bash
git clone https://github.com/customerdog/customerdog.git
cd customerdog
npm install
```

### 2. Create the Supabase project + run the schema

Sign in at [supabase.com](https://supabase.com) → **New project** (the free tier is enough for ~10K conversations). Once it's ready:

**a. Get the Project URL** (`SUPABASE_URL`). Click the green **Connect** button at the top of any project page; the URL is in the popover. Format: `https://<project-ref>.supabase.co`.

**b. Get the Secret API key** (`SUPABASE_SERVICE_ROLE_KEY`). Left sidebar → **Settings** (gear icon at the bottom) → **API Keys**. You'll see two tabs:

- **Publishable and secret API keys** ← Supabase's newer system. Click here, then copy the **Secret** key (`sb_secret_…`). This is what they recommend going forward.
- **Legacy anon, service_role API keys** ← the older format. If you're on this tab, copy the **service_role secret** (`eyJ…` JWT). Same effective permissions; works fine with our code.

**Either key works** with `supabase-js` and unlocks our `service_role`-equivalent permissions. Whichever tab you use, **DO NOT copy the Publishable / `anon` key** — that one is restricted by Row-Level Security and will return permission errors on every query against our tables.

**c. Get the Postgres connection string** (`DATABASE_URL`). **Settings → Database → Connection string** tab. Pick **Session pooler** (port `5432`). Use Session, NOT Transaction — the Transaction pooler can reject the multi-statement DDL in our `schema.sql`. Since we only use this connection during the rare migration event, the longer-lived connections of session mode are fine. Copy the URL exactly; it has your project's database password embedded. customerdog uses this **only** to run `supabase/schema.sql` on the first admin page load — never wipes existing data because:
- Our `requireSchema()` helper probes the `config` table first and only attempts the migration when it's genuinely missing.
- The migration also pre-checks `information_schema.tables` and short-circuits if our four tables already exist.
- `schema.sql` itself uses `CREATE TABLE IF NOT EXISTS` and `INSERT … ON CONFLICT DO NOTHING` — even a forced re-run is a no-op against a populated database.

**d. Run the schema (skipped automatically — keep reading).** With `DATABASE_URL` set, you don't need to do anything in the SQL Editor. The first time you load `/admin/*`, customerdog opens a direct Postgres connection, runs `schema.sql`, and proceeds. If for any reason that fails (network, wrong URL), the admin redirects to `/admin/setup` for a manual click-to-install fallback.

### 3. Mint a qlaud key

Sign in at [qlaud.ai/keys](https://qlaud.ai/keys) → **Create key** with **scope = admin** (admin scope is required to register tools). Copy the `qlk_live_…` value — you'll need it in step 4.

### 4. Local env vars

```bash
cp .env.example .env.local
```

Now open `.env.local` and paste in the six required values. The two `ADMIN_*` vars want strong random strings — run these and paste each output into the matching slot:

```bash
openssl rand -base64 32   # → ADMIN_PASSWORD
openssl rand -base64 32   # → ADMIN_COOKIE_SECRET
```

Final `.env.local` should look like:

```
QLAUD_KEY=qlk_live_…                          # from step 3
SUPABASE_URL=https://xxx.supabase.co          # from step 2
SUPABASE_SERVICE_ROLE_KEY=eyJ…                # from step 2
ADMIN_PASSWORD=…                              # openssl rand -base64 32
ADMIN_COOKIE_SECRET=…                         # openssl rand -base64 32
NEXT_PUBLIC_APP_URL=http://localhost:3000     # change to deploy URL after step 6
```

### 5. Verify locally

```bash
npm run check    # live-probes Supabase + qlaud, shows what's missing
npm run dev      # → http://localhost:3000
```

Open `http://localhost:3000/admin/login`, sign in with your `ADMIN_PASSWORD`, paste a docs URL at `/admin/kb`, then test the chat at `/chat`.

### 6. Deploy

**One-click via the button at the top of this README** — Vercel walks you through entering all six env vars. After it deploys, come back and:

- Update `NEXT_PUBLIC_APP_URL` in Vercel → Settings → Environment Variables to the real deploy URL (e.g., `https://support.yourcompany.com`)
- Redeploy

**Or any other Next.js host** — Railway, Fly.io, Cloudflare Pages with the Workers adapter, your own VPS. Set the same seven env vars in the host's environment configuration, then `npm run build` + `npm run start`. No Vercel-specific code anywhere in the repo.

### 7. First admin visit — auto-bootstrap

Open `https://your-deploy/admin/login`, sign in. The first admin page request triggers two automatic bootstrap steps in the background, both idempotent and once-per-deploy:

1. **Schema install** — connects via `DATABASE_URL`, probes `information_schema.tables`, runs `supabase/schema.sql` if any of our tables are missing.
2. **Tool registration** — for every tool in `src/lib/tools/definitions.ts` that doesn't yet have a row in `tool_registrations`, calls qlaud's `POST /v1/tools` and stores the result. The HMAC secrets live in Supabase, not in env vars.

You don't need to run `npm run register-tools` (it's still there as a manual escape hatch for forced rotation). If anything fails, the admin error boundary shows the underlying message + a likely fix.

### 7a. Tenant-share the tools at qlaud (one-time)

customerdog's chat handler sends `tools_mode: "tenant"`, which means the AI gets exactly the tools you've marked as tenant-shared in your qlaud dashboard. **Until you do this once, the AI runs with zero tools attached and can only answer from the KB — `create_ticket` and `send_email_to_user` won't fire.**

Steps (one-time, takes ~30 seconds):

1. Open [qlaud.ai/tools](https://qlaud.ai/tools).
2. Find the two webhooks customerdog auto-registered: `create_ticket` and `send_email_to_user`. They'll have your deploy URL listed as the webhook target.
3. Toggle each one to **tenant-shared** (or pick the equivalent in qlaud's UI — the "Connect with your company's key" / share toggle).
4. Optionally enable any qlaud built-ins or MCP catalog connectors you want (Resend, Linear, Stripe, GitHub, etc.) — also tenant-share them. They surface to the AI through the same flow as our webhooks.

That's it. Every chat turn now includes whichever tools you've shared. To revoke a tool from the AI, untoggle it in the dashboard — no redeploy needed.

### 8. Configure the agent

Open `https://your-deploy/admin/login` and:

1. **`/admin/settings`** — set company name, brand color, ticket destination (email/Slack/Linear/Zendesk), visitor contact policy.
2. **`/admin/kb`** — paste your docs URL (server fetches + parses) or raw markdown. The AI starts answering from it on the next chat turn.
3. **`/admin/embed`** — copy the `<script>` snippet onto your site, or just point visitors to `https://your-deploy/chat`.

## Three ways visitors find you

```html
<!-- Way 1: full-page hosted chat -->
<a href="https://support.yourcompany.com/chat">Talk to support</a>

<!-- Way 2: embeddable widget (chat bubble bottom-right) -->
<script src="https://support.yourcompany.com/widget.js" defer></script>

<!-- Way 3: your own iframe -->
<iframe src="https://support.yourcompany.com/embed"
        width="380" height="600"></iframe>
```

## Required env vars

| Var | Where to get it |
|---|---|
| `QLAUD_KEY` | qlaud.ai/keys (admin scope) |
| `SUPABASE_URL` | supabase.com → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same |
| `ADMIN_PASSWORD` | `openssl rand -base64 32` |
| `ADMIN_COOKIE_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | your deploy URL |

## Optional env vars (pick what your config needs)

| Var | When |
|---|---|
| `RESEND_API_KEY` | always nice to have — `send_email_to_user` tool needs it; required if `ticket_destination=email` |
| `TICKET_EMAIL_TO` | if `ticket_destination=email` |
| `SLACK_WEBHOOK_URL` | if `ticket_destination=slack` |
| `LINEAR_API_KEY` + `LINEAR_TEAM_ID` | if `ticket_destination=linear` |
| `ZENDESK_SUBDOMAIN` + `ZENDESK_EMAIL` + `ZENDESK_API_TOKEN` | if `ticket_destination=zendesk` |

## Adding a tool

Tools are defined in [`src/lib/tools/definitions.ts`](src/lib/tools/definitions.ts). Add a new entry there + a corresponding route handler at `src/app/api/tools/<your-tool>/route.ts`. The next admin page load auto-registers it with qlaud. qlaud handles the dispatch loop, signature verification, retries, parallel fan-out — your handler just runs the business logic and returns `{ output: any }`.

## Adding a ticket destination

Drop a new file in `src/lib/destinations/<name>.ts` exporting a `sendTo<Name>` function. Wire it into the dispatcher in `src/lib/destinations/index.ts`, add the destination value to the `ticket_destination` enum in `supabase/schema.sql` and `src/lib/supabase.ts`, then add the option to the dropdown in `/admin/settings`.

## Self-hosting Supabase

This codebase only talks to Supabase via its REST endpoint and the service-role key. To self-host: spin up Supabase via [docker-compose](https://supabase.com/docs/guides/self-hosting/docker), run `supabase/schema.sql`, set `SUPABASE_URL` to your self-hosted instance and `SUPABASE_SERVICE_ROLE_KEY` to the service key it generates. No code changes.

## License

MIT. See [LICENSE](LICENSE).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PLAN.md](docs/PLAN.md).

# customerdog

> **Open-source AI customer support agent.**
> Clone the repo, plug in two services (qlaud + Supabase), set a password, deploy. Your visitors chat anonymously with an AI that answers from your knowledge base and escalates to a human when it can't resolve.

🐕 Live demo: [your-deploy.vercel.app](#) · 📖 [Architecture](docs/ARCHITECTURE.md) · 🗺 [Roadmap](docs/PLAN.md)

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog&env=QLAUD_KEY,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,DATABASE_URL,ADMIN_PASSWORD,ADMIN_COOKIE_SECRET,NEXT_PUBLIC_APP_URL&envDescription=QLAUD_KEY%20from%20qlaud.ai%2Fkeys.%20SUPABASE_URL%20%2B%20SUPABASE_SERVICE_ROLE_KEY%20from%20Settings%20%E2%86%92%20API%20Keys%20%28Secret%29.%20DATABASE_URL%20from%20Settings%20%E2%86%92%20Database%20%E2%86%92%20Session%20pooler%20%28port%205432%29%20so%20schema%20auto-runs%20on%20first%20deploy.%20ADMIN_PASSWORD%20%2B%20ADMIN_COOKIE_SECRET%3A%20use%20%60openssl%20rand%20-base64%2032%60%20for%20each.%20NEXT_PUBLIC_APP_URL%3A%20put%20a%20placeholder%2C%20update%20after%20first%20deploy.&envLink=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog%2Fblob%2Fmain%2F.env.example&project-name=customerdog&repository-name=customerdog)

The button opens Vercel's import flow with all seven required env vars pre-listed — Vercel walks you through entering each one before the first build, so a fresh deploy can't ship broken. After deploy, come back to your project's Environment Variables to update `NEXT_PUBLIC_APP_URL` from the placeholder to your real Vercel URL (or custom domain like `support.yourcompany.com`), and redeploy. Schema install runs automatically on first `/admin/*` load — no scripts to run on the customerdog side. Tools (file ticket, send email, lookup customer, etc.) are configured separately in your qlaud dashboard; see step 7 below.

**Before you click the button, you'll need:**

1. **A free Supabase project.** Create at [supabase.com](https://supabase.com). You don't have to run the schema yourself — `DATABASE_URL` (below) lets customerdog do it on first deploy. Grab three values: the **Project URL**, the **Secret API key** (Settings → API Keys → either tab works; see step 2 below), and the **Session pooler connection string** (Settings → Database → Connection string → **Session** pooler tab, port 5432).
2. **A qlaud key** with admin scope from [qlaud.ai/keys](https://qlaud.ai/keys).
3. **Two random secrets** for the admin cookie + password: run `openssl rand -base64 32` twice.

---

## Walkthrough

### What visitors see

Visitor types a question, AI streams an answer from your knowledge base. Markdown rendering, code blocks, links — all standard. Tools (file ticket, send email, lookup customer) fire mid-stream when the AI decides to call one; the response continues seamlessly. Footer says "Powered by customerdog" but that's a one-line edit if you want to remove it.

![Visitor chatting with the customerdog AI assistant](docs/images/01-visitor-chat.png)

### Admin dashboard

Sign in once with `ADMIN_PASSWORD`, get a 30-day signed-cookie session. Four cards land you on the four pages that matter; tools (send email, file ticket, etc.) live entirely at [qlaud.ai/tools](https://qlaud.ai/tools) — enable any built-in or MCP connector and tenant-share it.

![customerdog admin dashboard](docs/images/02-admin-dashboard.png)

### Knowledge base — paste a URL, crawl a sitemap, paste markdown

`/admin/kb` is one page with three input modes. Drop a single docs URL and the server fetches it + extracts the article body via Mozilla Readability. Or click **Crawl + add** on the docs root and customerdog discovers every page via `sitemap.xml` (falls back to same-origin link extraction), pulling up to 50 pages per run in ~10 seconds. The whole corpus sits in the AI's `cache_control: ephemeral` system prompt — Anthropic's prompt cache makes the long context cheap on every turn.

![Admin knowledge base management](docs/images/03-admin-kb.png)

### Settings — branding + system-prompt extras

Four fields: company name (shown to visitors), brand color (the widget bubble accent), support email (visitor-facing fallback if a tool fails), and free-form system-prompt instructions (tone of voice, things to never say, when to invite a human takeover). That's it. No `ticket_destination`, no `RESEND_API_KEY` — qlaud handles all of that.

![Admin settings page](docs/images/04-admin-settings.png)

### Conversations — every visitor session, transcripts on demand

Each anonymous visitor session shows up here. Click a row for the full transcript, pulled live from qlaud's `/v1/threads/<id>/messages` (we don't store transcripts twice). Useful for spotting patterns ("we keep getting asked about X — let's add it to the KB"). Power users get an "Open conversations in Supabase" link to view the raw rows in Supabase's Table Editor.

![Past conversations](docs/images/05-admin-conversations.png)

### Embed — copy the snippet, paste on your site

`/admin/embed` shows the exact `<script>` tag with your `data-color` baked in, plus a **Live preview** iframe directly below — exactly what visitors see when they click the bubble. One copy, one paste, done. Works on any host page (no build step, no React, nothing to install on the host site).

![Embed widget snippet generator with live preview](docs/images/06-admin-embed.png)

---

## What you get

- **Three visitor surfaces** — hosted page at `support.yourcompany.com/chat`, embeddable widget (`<script src="…/widget.js">`), or raw iframe at `/embed`.
- **Anonymous chat** — cookie-only sessions. Visitors don't sign up. Conversations correlate via `end_user_id` on qlaud's side.
- **Knowledge base as cached context** — admin pastes URLs (server fetches + parses with Mozilla Readability) or markdown; the entire corpus is concatenated into the system prompt with `cache_control: ephemeral` so Anthropic's prompt cache makes long contexts cheap.
- **Tools live entirely at qlaud** — enable any built-in (Resend, Slack, Linear, Zendesk, GitHub, Notion, Twilio) or MCP catalog connector (Stripe, Shopify, HubSpot, etc.) at qlaud.ai/tools and tenant-share it. customerdog's chat handler picks them up automatically, no env vars or webhook handlers on our side.
- **Past conversations browsable** in `/admin/conversations` — list of visitor sessions with transcripts pulled live from qlaud.
- **Single password admin** — no Clerk, no third-party auth. Set `ADMIN_PASSWORD` in env.
- **Single qlaud key** — no per-user key minting. One key per deployment, signed cookie holds the visitor's session.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| AI runtime | [qlaud](https://qlaud.ai) — threads, tool dispatch, prompt cache passthrough, tenant-mode tool catalog |
| Tools (email, tickets, lookups, …) | Configured at qlaud.ai/tools — built-ins (Resend, Slack, Linear, Zendesk, GitHub, Notion) + MCP catalog (Stripe, Shopify, HubSpot, Cal.com, …) |
| Storage | [Supabase](https://supabase.com) — Postgres for KB + conversations + config |
| HTML extraction | `@mozilla/readability` + `jsdom`, optional Firecrawl for JS-rendered pages |
| Admin auth | Single shared password → signed HTTP-only cookie |
| Visitor session | HTTP-only cookie, anonymous UUID |
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

Now open `.env.local` and paste in the seven required values. The two `ADMIN_*` vars want strong random strings — run these and paste each output into the matching slot:

```bash
openssl rand -base64 32   # → ADMIN_PASSWORD
openssl rand -base64 32   # → ADMIN_COOKIE_SECRET
```

Final `.env.local` should look like:

```
QLAUD_KEY=qlk_live_…                                            # from step 3
SUPABASE_URL=https://xxx.supabase.co                            # from step 2
SUPABASE_SERVICE_ROLE_KEY=eyJ…                                  # from step 2
DATABASE_URL=postgresql://postgres.xxx:…@…pooler.supabase.com:5432/postgres   # from step 2
ADMIN_PASSWORD=…                                                # openssl rand -base64 32
ADMIN_COOKIE_SECRET=…                                           # openssl rand -base64 32
NEXT_PUBLIC_APP_URL=http://localhost:3000                       # change to deploy URL after step 6
```

### 5. Verify locally

```bash
npm run check    # live-probes Supabase + qlaud, shows what's missing
npm run dev      # → http://localhost:3000
```

Open `http://localhost:3000/admin/login`, sign in with your `ADMIN_PASSWORD`, paste a docs URL at `/admin/kb`, then test the chat at `/chat`.

### 6. Deploy

**One-click via the button at the top of this README** — Vercel walks you through entering all seven env vars. After it deploys, come back and:

- Update `NEXT_PUBLIC_APP_URL` in Vercel → Settings → Environment Variables to the real deploy URL (e.g., `https://support.yourcompany.com`)
- Redeploy

**Or any other Next.js host** — Railway, Fly.io, Cloudflare Pages with the Workers adapter, your own VPS. Set the same seven env vars in the host's environment configuration, then `npm run build` + `npm run start`. No Vercel-specific code anywhere in the repo.

### 7. First admin visit — schema bootstrap

Open `https://your-deploy/admin/login`, sign in. The first admin page request connects via `DATABASE_URL`, probes `information_schema.tables`, and runs `supabase/schema.sql` if any of our tables are missing. Idempotent + once-per-deploy. If anything fails, the admin error boundary shows the underlying message + a likely fix.

### 7a. Add tools at qlaud.ai/tools

customerdog's chat handler sends `tools_mode: "tenant"`. Whatever you tenant-share at [qlaud.ai/tools](https://qlaud.ai/tools), the AI can call. customerdog itself doesn't register tools, doesn't store HMAC secrets, doesn't dispatch destinations — qlaud handles all of that.

**Three kinds of tool, all in qlaud's dashboard:**

| Kind | Use for | Examples |
|---|---|---|
| **Catalog (built-ins)** | Common providers — qlaud hosts the handler, you give it credentials | Resend send-email, Slack post-message, Linear create-issue, Zendesk create-ticket, GitHub create-issue, Notion append-page, Twilio SMS, web search, image gen |
| **MCP server** | Vendor-curated connectors — one-click connect | Stripe, Shopify, HubSpot, PostHog, Cal.com, Atlassian, Sentry, etc. |
| **Custom (webhook)** | An HTTPS endpoint you host — qlaud signs the dispatch with HMAC | Anything you build yourself |

Steps:

1. Open [qlaud.ai/tools](https://qlaud.ai/tools).
2. Click **Add a tool** → pick a kind, paste credentials.
3. Toggle the new tool **tenant-shared**.

The AI sees it on the next chat turn, no redeploy needed. To revoke an integration, untoggle in the dashboard.

**Recommended starter pack for a customer-support deploy:**

- `qlaud-builtin/send-email` (Resend) — for follow-up emails
- One of `qlaud-builtin/linear-create-issue` / `zendesk-create-ticket` / `slack-post-message` — for escalation
- Optionally a Stripe / Shopify / Intercom MCP if your support workflow needs customer lookups

### 8. Configure the agent

Open `https://your-deploy/admin/login` and:

1. **`/admin/settings`** — company name, brand color, support email (visitor-facing fallback), and any extra system-prompt instructions (tone of voice, things to never say, etc.).
2. **`/admin/kb`** — paste your docs URL (server fetches + parses) or raw markdown, or use **Crawl an entire docs site** to ingest a whole sitemap. The AI starts answering from it on the next chat turn.
3. **`/admin/embed`** — copy the `<script>` snippet onto your site, or just point visitors to `https://your-deploy/chat`.

Already done step 7a (added tools at qlaud.ai/tools)? You're live.

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
| `QLAUD_KEY` | [qlaud.ai/keys](https://qlaud.ai/keys) |
| `SUPABASE_URL` | Supabase project → top-right **Connect** popover (project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → **Secret** key (NOT publishable / anon) |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string → **Session pooler** tab (port 5432) |
| `ADMIN_PASSWORD` | `openssl rand -base64 32` |
| `ADMIN_COOKIE_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | your deploy URL (placeholder OK at first deploy; update + redeploy after) |

## Optional env vars

| Var | When |
|---|---|
| `FIRECRAWL_API_KEY` | If your KB sources are JS-rendered SPAs that the native `fetch + Mozilla Readability` extractor can't see into. Routes URL ingestion through Firecrawl's `/v1/scrape` (free tier 500 page-credits at firecrawl.dev). Without it, customerdog handles SSR/SSG sites just fine. |

## Adding a tool

Don't add it to customerdog — add it to qlaud. Open [qlaud.ai/tools](https://qlaud.ai/tools), pick a kind (Catalog / MCP server / Custom webhook), paste credentials, tenant-share. The AI sees it on the next chat turn. customerdog's chat handler doesn't enumerate tools per-request; qlaud's tenant mode handles dispatch.

If you specifically need customerdog-side business logic (e.g., contact-policy gates, audit logs into Supabase), register a Custom (webhook) tool in qlaud pointing at a new `/api/tools/<your-tool>` route on your customerdog deploy. You write the handler, qlaud signs the dispatch with HMAC, you verify and respond. The two webhooks customerdog used to ship for this (`create_ticket`, `send_email_to_user`) were removed in favor of qlaud's built-ins — see git history if you want to revive that pattern.

## Self-hosting Supabase

This codebase only talks to Supabase via its REST endpoint and the service-role key. To self-host: spin up Supabase via [docker-compose](https://supabase.com/docs/guides/self-hosting/docker), run `supabase/schema.sql`, set `SUPABASE_URL` to your self-hosted instance and `SUPABASE_SERVICE_ROLE_KEY` to the service key it generates. No code changes.

## License

MIT. See [LICENSE](LICENSE).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PLAN.md](docs/PLAN.md).

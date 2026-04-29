# customerdog

> **Open-source AI customer support agent.**
> Clone the repo, plug in two services (qlaud + Supabase), set a password, deploy. Your visitors chat anonymously with an AI that answers from your knowledge base and escalates to a human when it can't resolve.

🐕 Live demo: [your-deploy.vercel.app](#) · 📖 [Architecture](docs/ARCHITECTURE.md) · 🗺 [Roadmap](docs/PLAN.md)

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog&env=QLAUD_KEY,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,ADMIN_PASSWORD,ADMIN_COOKIE_SECRET,NEXT_PUBLIC_APP_URL&envDescription=QLAUD_KEY%20from%20qlaud.ai%20%28admin%20scope%29.%20SUPABASE_*%20from%20Project%20Settings%20%E2%86%92%20API.%20ADMIN_PASSWORD%20%2B%20ADMIN_COOKIE_SECRET%3A%20use%20%60openssl%20rand%20-base64%2032%60%20for%20each.%20NEXT_PUBLIC_APP_URL%3A%20put%20a%20placeholder%2C%20update%20after%20first%20deploy.&envLink=https%3A%2F%2Fgithub.com%2Fcustomerdog%2Fcustomerdog%2Fblob%2Fmain%2F.env.example&project-name=customerdog&repository-name=customerdog)

The button opens Vercel's import flow with all six required env vars pre-listed — Vercel walks you through entering each one before the first build, so a fresh deploy can't ship broken. After deploy, come back to your project's Environment Variables to update `NEXT_PUBLIC_APP_URL` from the placeholder to your real Vercel URL (or custom domain like `support.yourcompany.com`), and redeploy. Then run `npm run register-tools` locally to wire up the escalation tools (see below).

**Before you click the button, you'll need:**

1. **A free Supabase project.** Create at [supabase.com](https://supabase.com) → open SQL Editor → paste & run [`supabase/schema.sql`](supabase/schema.sql). Copy `URL` + `service_role` key from Project Settings → API.
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

- **SQL Editor → New query →** paste the contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
- **Project Settings → API →** copy these two values, you'll need them in step 4:
  - `Project URL` → `SUPABASE_URL`
  - **Secret key** (sometimes still labelled `service_role`) → `SUPABASE_SERVICE_ROLE_KEY`. **NOT the Publishable / `anon` key** — they look almost identical (both are `eyJ…` JWTs), but the publishable one is gated by Row-Level Security and won't have permission to read the tables we ship.

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

**Or any other Next.js host** — Railway, Fly.io, Cloudflare Pages with the Workers adapter, your own VPS. Set the same six env vars in the host's environment configuration, then `npm run build` + `npm run start`. No Vercel-specific code anywhere in the repo.

### 7. Register the escalation tools with qlaud

This step happens once after your first deploy so the tool webhook URLs point at your live host:

```bash
# Update NEXT_PUBLIC_APP_URL in .env.local first to match the deployed URL.
npm run register-tools
```

Output:

```
✓ create_ticket          → tool_…
✓ send_email_to_user     → tool_…

Done. Add these to your env (Vercel → Settings → Environment Variables, then redeploy):

QLAUD_TOOL_SECRET_CREATE_TICKET=wsk_…
QLAUD_TOOL_SECRET_SEND_EMAIL=wsk_…
```

Paste both into your hosting env vars and redeploy.

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

Tools are defined in [`src/lib/tools/definitions.ts`](src/lib/tools/definitions.ts). Add a new entry there + a corresponding route handler at `src/app/api/tools/<your-tool>/route.ts`, then re-run `npm run register-tools`. qlaud handles the dispatch loop, signature verification, retries, parallel fan-out — your handler just runs the business logic and returns `{ output: any }`.

## Adding a ticket destination

Drop a new file in `src/lib/destinations/<name>.ts` exporting a `sendTo<Name>` function. Wire it into the dispatcher in `src/lib/destinations/index.ts`, add the destination value to the `ticket_destination` enum in `supabase/schema.sql` and `src/lib/supabase.ts`, then add the option to the dropdown in `/admin/settings`.

## Self-hosting Supabase

This codebase only talks to Supabase via its REST endpoint and the service-role key. To self-host: spin up Supabase via [docker-compose](https://supabase.com/docs/guides/self-hosting/docker), run `supabase/schema.sql`, set `SUPABASE_URL` to your self-hosted instance and `SUPABASE_SERVICE_ROLE_KEY` to the service key it generates. No code changes.

## License

MIT. See [LICENSE](LICENSE).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PLAN.md](docs/PLAN.md).

# customerdog

> **Open-source AI customer support agent.**
> Clone the repo, plug in two services (qlaud + Supabase), set a password, deploy. Your visitors chat anonymously with an AI that answers from your knowledge base and escalates to a human when it can't resolve.

🐕 Live demo: [your-deploy.vercel.app](#) · 📖 [Architecture](docs/ARCHITECTURE.md) · 🗺 [Roadmap](docs/PLAN.md)

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

## Setup (~15 minutes from scratch)

```bash
# 1. Clone + install
git clone https://github.com/customerdog/customerdog.git
cd customerdog
npm install

# 2. Supabase: create a free project at supabase.com → SQL Editor →
#    paste the contents of supabase/schema.sql → Run.
#    Then Project Settings → API → copy the URL + service_role key.

# 3. qlaud: create a key at console.qlaud.ai/keys with admin scope
#    (admin scope is needed to register tools).

# 4. Env
cp .env.example .env.local
# Fill in QLAUD_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# ADMIN_PASSWORD (openssl rand -base64 32),
# ADMIN_COOKIE_SECRET (openssl rand -base64 32),
# NEXT_PUBLIC_APP_URL (http://localhost:3000 for dev).

# 5. Verify env actually works (live probes)
npm run check

# 6. Dev
npm run dev
# → http://localhost:3000           — visitor landing
# → http://localhost:3000/chat      — full-page chat
# → http://localhost:3000/admin     — admin (sign in with ADMIN_PASSWORD)
```

### Production deploy

Deploy anywhere Next.js runs. Vercel is the smoothest:

```bash
vercel deploy
# Vercel reads the same env vars; set them in the project's
# Environment Variables before deploying. Update NEXT_PUBLIC_APP_URL
# to the production URL (e.g. https://support.yourcompany.com).
```

After your first deploy, **register the escalation tools with qlaud**:

```bash
npm run register-tools
# Prints: QLAUD_TOOL_SECRET_CREATE_TICKET=wsk_…
#         QLAUD_TOOL_SECRET_SEND_EMAIL=wsk_…
# Paste both back into env, redeploy.
```

Now open `https://your-deploy/admin/login`, sign in, and:
1. **`/admin/kb`** — paste your docs URL or markdown. The AI starts answering from it immediately.
2. **`/admin/settings`** — pick your ticket destination (email/Slack/Linear/Zendesk) and set the matching env vars.
3. **`/admin/embed`** — copy the `<script>` snippet onto your site, OR send visitors directly to `https://your-deploy/chat`.

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
| `QLAUD_KEY` | console.qlaud.ai/keys (admin scope) |
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

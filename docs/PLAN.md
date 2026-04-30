# customerdog — current state + future work

> This doc was originally a design plan. It's now a status doc: what's
> shipped vs. what we deliberately deferred. Refer to
> [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime shape and to the
> [README](../README.md) for setup instructions.

## What customerdog is today

Open-source AI customer-support agent. Clone the repo, deploy to Vercel
(or anywhere Next.js runs), connect to qlaud + Supabase, configure the
tools you want at qlaud's dashboard, embed the widget on your site.

- **Visitors chat anonymously.** Cookie-only session, no signup.
- **The AI answers from a per-deploy knowledge base** assembled into a
  cache_control'd system prompt — Anthropic's prompt cache makes long
  context cheap.
- **Tools live entirely at qlaud** (built-ins, MCP catalog, custom
  webhooks). customerdog sends `tools_mode: "tenant"` and qlaud auto-
  attaches whatever the operator marked tenant-shared. Streaming +
  tool dispatch coexist on a single SSE.
- **Admin is a single password** + a signed cookie. No third-party
  auth dep.
- **Three visitor surfaces**: hosted chat at `/chat`, iframe widget at
  `/embed`, drop-in `<script>` bubble via `/widget.js`.

## Open-source design tenets

1. **Clone-and-deploy.** Single git clone, Vercel deploy, fill in 7
   env vars, done.
2. **Single-tenant per clone.** One repo = one company.
3. **Anonymous-first chat.** Visitors don't sign up.
4. **KB as system prompt.** No vector store, no embedding pipeline —
   the prompt cache absorbs the cost.
5. **Single admin password.** No Clerk, no OAuth dance.
6. **qlaud owns tools.** customerdog doesn't ship destination
   dispatchers, HMAC verifiers, audit logs, or registration scripts —
   qlaud's tenant-mode dashboard handles the lot.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| AI runtime | qlaud (one key per deploy, tools_mode='tenant') |
| Tools | Configured at qlaud.ai/tools — Catalog (built-ins), MCP servers, Custom webhooks |
| Storage | Supabase (Postgres) — config, KB sources, conversations |
| HTML extraction | `@mozilla/readability` + `jsdom`, optional Firecrawl for SPAs |
| Admin auth | Single password env var → signed HTTP-only cookie |
| Visitor session | HTTP-only cookie, anonymous UUID |
| Widget | Plain `<script>` + iframe + postMessage |

## Supabase schema (3 tables)

```sql
config           -- single row (id=1)
  company_name | brand_color | support_email | system_prompt_extras
  | updated_at

kb_sources       -- knowledge base
  id | type ('url'|'markdown'|'pasted') | source | parsed_content
  | active | updated_at

conversations    -- anonymous visitor sessions
  id | anon_visitor_id | qlaud_thread_id | started_at | ended_at
  | resolved | summary
```

Schema lives in `supabase/schema.sql`. Auto-applied on first admin page
load via `pg` connection (the operator provides `DATABASE_URL`).
Click-to-install fallback at `/admin/setup` if `pg` migration fails.

## Routes

### Visitor (no auth)

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/chat` | Full-page chat |
| `/embed` | Iframe-friendly chat (no header chrome) |
| `/widget.js` | Vanilla JS bubble bootstrap (~3KB, served from `public/`) |
| `/api/chat` | SSE streaming endpoint. Reads visitor + thread cookies, mints qlaud thread on first message, sends with cache_control system prompt + `tools_mode: "tenant"` |

### Admin (gated by signed cookie)

| Route | Purpose |
|---|---|
| `/admin/login` | Password input |
| `/admin` | Dashboard |
| `/admin/kb` | Manage `kb_sources` rows: add URL (server fetches + Readability-extracts), paste markdown, full-site crawl with sitemap discovery |
| `/admin/conversations` + `/admin/conversations/[id]` | List + transcript view (transcript pulled live from qlaud) |
| `/admin/settings` | Edit `config` row (4 fields: company name, brand color, support email, system prompt extras) |
| `/admin/embed` | `<script>` snippet generator with live preview |
| `/admin/setup` | Manual schema-install fallback if auto-migrate fails |

## Env vars

```bash
# Required (7)
QLAUD_KEY=qlk_live_…                               # qlaud.ai/keys
SUPABASE_URL=https://xxx.supabase.co               # Supabase Connect popover
SUPABASE_SERVICE_ROLE_KEY=eyJ…                     # Supabase API Keys → Secret
DATABASE_URL=postgresql://…:5432/postgres          # Supabase Database → Session pooler
ADMIN_PASSWORD=<long-random>                       # openssl rand -base64 32
ADMIN_COOKIE_SECRET=<long-random>                  # openssl rand -base64 32
NEXT_PUBLIC_APP_URL=https://your-deploy.vercel.app # placeholder OK at first deploy

# Optional (1)
FIRECRAWL_API_KEY=fc_…                             # for JS-rendered SPA ingestion
```

## Setup flow (operator's path-to-live)

```bash
# 1. Click the Vercel deploy button (README), fill 7 env vars
# 2. First /admin/login → schema auto-bootstraps via DATABASE_URL
# 3. /admin/kb → add docs URLs / paste markdown / crawl a sitemap
# 4. qlaud.ai/tools → enable any built-in (Resend / Slack / Linear /
#    Zendesk / etc.) or MCP connector (Stripe / Shopify / …) →
#    tenant-share each
# 5. /admin/embed → drop the <script> snippet on your site
```

## Decisions deferred to Phase 2

- **Multi-admin / SSO** — single-password is enough for solo deployments.
  Would re-add Clerk in middleware if needed.
- **`get_user_context` MCP** — pull authenticated visitor's account
  data from the host site (postMessage JWT). Adds personalized answers
  for B2B SaaS use cases.
- **Per-deploy tool allowlist** — switch to `tools_mode: "explicit"`
  with a customerdog-side allowlist UI. Currently we trust qlaud's
  account-wide tenant-share state.
- **Stripe metering** — pull from qlaud `/v1/usage` to bill per-
  conversation. Only relevant if customerdog itself becomes a hosted
  product.
- **Self-hosted Supabase** — already works (same env vars, point at
  your own self-hosted instance).

## What was removed in cleanup (and why)

| Component | Why dropped |
|---|---|
| `/api/tools/create-ticket` + `/api/tools/send-email` webhook handlers | qlaud's built-ins (`qlaud-builtin/send-email`, `linear-create-issue`, `zendesk-create-ticket`, etc.) cover the same dispatch with less code |
| `src/lib/destinations/` (email/slack/linear/zendesk dispatchers) | Same reason — qlaud builtins handle each destination |
| `src/lib/tools/{definitions,verify-signature}.ts` | No customerdog-side tool registration → no shared definitions or HMAC verifier needed |
| `src/lib/tool-register.ts` | qlaud's dashboard owns tool registration |
| `actions` table + `/admin/activity` page + `src/lib/activity.ts` | qlaud's `/v1/usage` shows tool-execution audit natively |
| `ticket_destination`, `visitor_contact_required` config columns | qlaud handles routing + input collection |
| `RESEND_*`, `TICKET_EMAIL_TO`, `SLACK_*`, `LINEAR_*`, `ZENDESK_*` env vars | All credentials live at qlaud now |
| `scripts/register-tools.ts` | No longer needed |
| `src/lib/rate-limit.ts` | No customerdog-side tool dispatch to rate limit |

If you want any of this back (e.g., for customerdog-side audit logs
that survive qlaud outages), the git history before commit `3e62792`
has the full implementation.

## Future improvements (not blocking)

- Batch admin actions (e.g., "delete all KB sources from <domain>")
- KB version history (snapshot the prompt before each meaningful change)
- Per-source token estimation in the KB list
- Conversation export (CSV / JSON dump from `/admin/conversations`)
- A "Connected qlaud tools" panel on `/admin` that pulls from qlaud's
  account API so the admin sees which tools the AI has access to
  without leaving customerdog

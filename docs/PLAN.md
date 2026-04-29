# CustomerDog — open-source customer support AI

**Pitch:** An open-source AI customer support agent that anyone can clone and deploy for their own company. Visitors chat anonymously through an embeddable widget or hosted page; the AI answers from the company's knowledge base, can collect contact info, and escalates to a human via email / Slack / Linear / Zendesk when it can't resolve. The company's admin manages the knowledge base and sees every action the AI took through a simple admin UI backed by Supabase (whose Table Editor doubles as an Airtable-like raw view for power users).

**Powered by qlaud** (threads, tools, prompt caching) + **Supabase** (config, KB sources, conversations, activity log).

## Open-source design tenets

1. **Clone-and-deploy.** Single git clone, Vercel deploy, fill in env vars, done. No services to provision beyond a free Supabase project and a qlaud key.
2. **Single-tenant per clone.** One repo = one company. No multi-tenancy complexity. If 50 companies use customerdog, that's 50 deployments.
3. **Anonymous-first chat.** Visitors don't sign up. Cookie-only session. Optional email/phone capture during escalation, configured by admin.
4. **No DB for KB.** Knowledge base lives in Supabase as rows of parsed text, but is loaded into memory at server boot and stuffed into the system prompt with `cache_control` markers. Anthropic's prompt cache eats the cost.
5. **Single admin password.** No Clerk, no OAuth dance. Admin sets `ADMIN_PASSWORD` in env, signs in once, gets a signed cookie session.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Inherited from chatai |
| AI substrate | qlaud (one standard key per deploy) | Threads + tool dispatch loop + prompt cache passthrough |
| Storage | Supabase (free tier) | Built-in Table Editor = the Airtable-like UX without us building it |
| Admin auth | Single password env var → signed HTTP-only cookie | Zero third-party services |
| Visitor session | HTTP-only cookie, anonymous UUID | No auth, no friction |
| Email | Resend | Simple, generous free tier |
| Tickets | Email / Slack / Linear / Zendesk (admin picks one) | Most common destinations |
| Widget | Plain `<script>` + iframe + postMessage | No build step for host site |

## Supabase schema (4 tables)

```sql
config           -- single row (id=1)
  company_name | brand_color | ticket_destination | visitor_contact_required
  | support_email | system_prompt_extras | updated_at

kb_sources       -- knowledge base
  id | type ('url'|'markdown'|'pasted') | source | parsed_content
  | active | updated_at

conversations    -- anonymous visitor sessions
  id | anon_visitor_id | qlaud_thread_id | started_at | ended_at
  | contact_email | contact_phone | resolved | summary

actions          -- audit log of every AI action
  id | conversation_id | type ('ticket_created'|'email_sent'|'contact_collected')
  | payload jsonb | result_url | created_at
```

The schema ships as `supabase/schema.sql`. Companies run it once via Supabase's SQL Editor at setup.

## Routes

### Visitor (no auth)
| Route | Purpose |
|---|---|
| `/` | Landing page → "Chat with our AI support" CTA → starts a chat |
| `/chat` | Full-page chat UI (for `support.companyfoo.com` deploys) |
| `/embed` | Same chat, no header/sidebar/branding chrome — sized for iframe widget |
| `/widget.js` | Vanilla JS bootstrap (~3KB). Drops a chat bubble onto the host page; opens iframe → `/embed` |
| `/api/chat` | SSE streaming chat endpoint. Reads `cd_visitor` + `cd_thread` cookies; creates qlaud thread on first message; sends with cached system prompt |

### Admin (gated by signed cookie)
| Route | Purpose |
|---|---|
| `/admin/login` | Single password input |
| `/admin` | Overview cards: open conversations, tickets this week, KB last refreshed |
| `/admin/kb` | Manage `kb_sources` rows: add URL (server fetches+parses), paste markdown, delete, "Re-learn" |
| `/admin/conversations` | Table of past conversations + transcript view (transcript fetched live from qlaud) |
| `/admin/activity` | Audit log table from `actions` |
| `/admin/settings` | Edit `config` row (company name, brand color, ticket destination + secrets, visitor contact requirement) |
| `/admin/embed` | Shows the `<script>` snippet to copy + live preview |

Each admin table page has an "Open in Supabase" link for power-user raw access.

### Tools (HMAC-signed, called by qlaud)
| Route | Purpose |
|---|---|
| `/api/tools/create-ticket` | Escalates to admin's chosen destination (email/Slack/Linear/Zendesk). Refuses if `visitor_contact_required` is set and contact not yet collected. Logs to `actions`. |
| `/api/tools/send-email` | Sends a follow-up email via Resend. Logs to `actions`. |

## Env vars

```bash
# qlaud — one standard key, all chats use it
QLAUD_KEY=qlk_live_…
QLAUD_BASE_URL=https://api.qlaud.ai          # optional

# Supabase — Project Settings → API
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ…

# Admin auth
ADMIN_PASSWORD=<long-random-string>           # set this; share with whoever runs admin
ADMIN_COOKIE_SECRET=<long-random-string>      # signs the session cookie

# Tools (optional — needed when admin chooses these)
RESEND_API_KEY=re_…                           # for send_email
TICKET_EMAIL_TO=support@yourcompany.com       # if ticket_destination = email
SLACK_WEBHOOK_URL=https://hooks.slack.com/…   # if ticket_destination = slack
LINEAR_API_KEY=lin_api_…                      # if ticket_destination = linear
LINEAR_TEAM_ID=…                              # if ticket_destination = linear
ZENDESK_SUBDOMAIN=…                           # if ticket_destination = zendesk
ZENDESK_EMAIL=…                               # if ticket_destination = zendesk
ZENDESK_API_TOKEN=…                           # if ticket_destination = zendesk

# Per-tool HMAC secrets (populated by `npm run register-tools` after first deploy)
QLAUD_TOOL_SECRET_CREATE_TICKET=wsk_…
QLAUD_TOOL_SECRET_SEND_EMAIL=wsk_…

# Public
NEXT_PUBLIC_APP_URL=https://support.yourcompany.com
```

## Setup flow (what someone cloning this does)

```bash
# 1. Clone
git clone https://github.com/customerdog/customerdog.git
cd customerdog
npm install

# 2. Supabase: create a free project at supabase.com, then in SQL Editor:
#    paste & run supabase/schema.sql

# 3. qlaud: create a standard key at qlaud.ai/keys

# 4. Env
cp .env.example .env.local
# fill in QLAUD_KEY, SUPABASE_*, ADMIN_PASSWORD, ADMIN_COOKIE_SECRET

# 5. Verify
npm run check

# 6. Deploy (Vercel / Railway / Fly / your own)
vercel deploy

# 7. Register tools with qlaud (one-time, after first deploy)
npm run register-tools
# copy the printed secrets back into env, redeploy

# 8. Open https://your-deploy.vercel.app/admin/login
#    sign in, go to /admin/kb, paste docs URLs / markdown, click "Re-learn"

# 9. Embed the widget on your site:
#    <script src="https://your-deploy.vercel.app/widget.js" defer></script>
```

## Five-commit execution plan

1. **`feat: supabase schema + admin password gate + drop Clerk`** — supabase client, schema.sql, admin session cookie, /admin/login, gate /admin/* in middleware. Drop Clerk dep + sign-in/sign-up/clerk-webhook + user-state.ts.
2. **`feat: knowledge base ingestion + admin/kb page`** — fetch+parse URLs, write rows to Supabase, in-memory KB cache with cache_control system prompt assembly, admin/kb CRUD UI.
3. **`feat: anonymous visitor chat with cookie session`** — rewrite /api/chat for anonymous, cookie-based threading, drop thread sidebar/search/list, drop old web-search & generate-image tools.
4. **`feat: create_ticket + send_email tools + activity log + remaining admin pages`** — escalation tools per destination, Resend email, fire-and-forget activity-log writes, /admin/activity, /admin/conversations, /admin/settings.
5. **`feat: embeddable widget + /embed route + admin/embed page`** — vanilla JS widget bootstrap, iframe-friendly /embed chat UI, snippet generator with live preview.

Plus a final commit updating README.md with the deploy guide above.

## Decisions deferred to Phase 2

- **Multi-admin / Clerk Organizations** — single-password is enough for MVP solo deployments.
- **`get_user_context` webhook** — fetch the visitor's account info from the company's backend when they're authenticated on the host site (postMessage JWT). Adds personalized answers.
- **Stripe metering** — pull from qlaud `/v1/usage`, charge per-conversation. Only relevant if customerdog itself becomes a hosted product (not a clone-and-deploy).
- **Self-hosted Supabase** — companies who hate managed services already can: same env vars, point at their own.

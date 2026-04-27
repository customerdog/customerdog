# CustomerDog — open-source customer support AI

**Pitch:** An embeddable AI support agent. B2B SaaS companies install the widget on their site; their end-users chat with it; the AI answers from the company's knowledge base, looks up user-specific context via webhooks, and escalates to a human ticket when it can't resolve. Powered by qlaud (threads, tools, search, billing) + chatai (UI patterns).

## What it shares with chatai
- Streaming SSE chat UI with live tool-execution cards
- qlaud per-user keys with hard spend caps
- Tool dispatch pattern (HMAC-signed webhooks, retries handled by qlaud)
- Clerk auth pattern, Next.js 15 + App Router

## What's new vs chatai
1. **Multi-tenancy** — chatai stores per-user state in Clerk privateMetadata (one user = one qlaud key). CustomerDog needs **per-company** state: a company's KB, settings, ticket integrations, plus per-end-user conversations within that company. This means a real database (Supabase/Postgres back).
2. **Embeddable widget** — companies drop a `<script>` snippet on their site that loads an iframe with the chat. Postmessage protocol for theming + identifying the end-user.
3. **Knowledge base** — file upload → parse (pdf/md/html) → embed → store. Each company's KB is isolated. Likely use qlaud's Vectorize via per-company namespace, or pgvector if you want full ownership.
4. **Ticket escalation** — when the AI can't resolve, it calls a `create_ticket` tool that fans out to Linear / Zendesk / Slack / email per the company's configured destination.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) — same as chatai |
| Auth (admin/B2B) | Clerk Organizations (built for multi-tenant) |
| DB (per-company state) | Supabase (companies, kb_docs, tickets, end_users, conversations) |
| AI substrate | qlaud (threads, tools, search, billing) |
| Embeddings (KB) | qlaud's `/v1/search` infra OR OpenAI embeddings + pgvector |
| Email | Resend |
| Ticket destinations | Linear API, Zendesk API, Slack webhooks, plain SMTP |
| Widget delivery | Plain `<script>` + iframe + postMessage |

## 4 demo tools to ship

1. **`search_kb`** — semantic search the company's uploaded docs. Returns top-N passages with source URLs.
2. **`get_user_context`** — POSTs to the company's configured webhook URL with the end-user's id; expects back `{name, email, plan, recent_orders, account_status, ...}`. Lets the AI personalize answers without you ever ingesting customer data.
3. **`create_ticket`** — escalates to whatever ticket destination the company configured (Linear issue / Zendesk ticket / Slack message / email). Returns the ticket URL so the AI can reply "I've opened ticket #ABC-123 for you."
4. **`send_email_to_user`** — sends a follow-up email summary via Resend (e.g., "Your password reset link is on the way").

## Phases (~2 weeks for MVP)

| Phase | Time | What |
|---|---|---|
| 1 | 2h | Fork + rebrand chatai (logo, copy, package name → customerdog) |
| 2 | 1d | Multi-tenancy: Clerk Organizations + `companies` table + per-org qlaud key minted in webhook |
| 3 | 1d | Embeddable widget: `/embed/[companyId]` route + `customerdog.js` bootstrap script + postMessage protocol |
| 4 | 2d | Knowledge base: upload → parse → embed → store + admin UI to manage docs |
| 5 | 1d | Tool: `search_kb` (per-company namespace) |
| 6 | 1d | Tool: `get_user_context` (POST to company webhook with HMAC) |
| 7 | 1d | Tool: `create_ticket` (Linear/Zendesk/Slack/email selectable per company) |
| 8 | 1d | Tool: `send_email_to_user` (Resend) |
| 9 | 2d | Admin dashboard: conversations, tickets, KB management, integration settings |
| 10 | 1d | Onboarding flow: sign up → set company → upload KB → install snippet |
| 11 | 1d | Pricing + Stripe: per-conversation metering pulled from qlaud `/v1/usage` |
| 12 | 1d | Polish + deploy (Vercel) |

## Things to decide upfront (don't block, but write down)

- **End-user identity**: anonymous chat (just collect email if escalation needed) vs. SSO from the parent app (postMessage in a JWT). Recommend: start anonymous, add JWT-based identification later.
- **KB source of truth**: do companies upload files (PDF/MD), point at a sitemap URL (recursive crawl), connect a docs source (Notion/Intercom Help Center)? MVP = file upload only.
- **Pricing model**: per-conversation, per-resolved-conversation, per-seat, free-up-to-N. Recommend: free up to 100 convos/mo, then $0.50/conversation. Maps cleanly to qlaud's `cost_micros` per request_id with a flat markup.

## Get started

```bash
# Clone chatai as the seed
git clone https://github.com/qlaudAI/chatai.git customerdog
cd customerdog

# Detach from chatai's remote, point at your own
git remote remove origin
git remote add origin git@github.com:customerdog/customerdog.git
git branch -M main

# Wipe the chatai-specific commit history (optional — keeps things clean)
rm -rf .git && git init && git add -A && git commit -m "initial: forked from qlaudAI/chatai"

# Rename in package.json + README (manually edit chatai → customerdog
# in package.json, README, .env.example)

# Push to the new remote
git push -u origin main
```

## What to tell the next session

When you start a new session in `/customerdog`, paste this as your first message:

> I'm building CustomerDog — an open-source AI customer support product, forked from chatai. The plan is in `docs/PLAN.md`. Read it, then start with Phase 1 (rebrand) and Phase 2 (Clerk Organizations + Supabase companies table). Don't auto-deploy anything; ask before pushing.

That gives the next session full context without you having to re-explain.

## Future git remote

```bash
git remote add origin git@github.com:customerdog/customerdog.git
git branch -M main
git push -u origin main
```

# Show HN draft

Copy-paste-ready. Edit the placeholder URLs (site, demo) before posting,
and tweak the opening line if you want a different angle.

---

## Title

```
Show HN: customerdog – Self-host an AI support chatbot in 5 minutes
```

(or)

```
Show HN: customerdog – Open-source customer support AI you can clone and deploy
```

---

## URL

```
https://github.com/customerdog/customerdog
```

---

## Body

I wanted an AI customer support agent for my own product, but every SaaS
option started at $200+/month and locked the knowledge base, branding,
and conversation history into their dashboard. So I built one as a
clonable Next.js app: 7 env vars + Vercel deploy + paste your docs URL +
done. MIT licensed.

What it ships:

- Streaming chat (SSE) at `/chat`. Embed it on any site as a `<script>`
  bubble (`/widget.js`), an iframe (`/embed`), or just link to `/chat`.
- Anonymous visitor sessions via cookies — no signup, no auth flow.
  Conversations correlated via qlaud's `end_user_id`.
- Knowledge base — paste a docs URL (server fetches it and Mozilla
  Readability extracts the article body), paste markdown, or crawl a
  whole sitemap with one click. Optional Firecrawl integration for
  JS-rendered SPAs.
- Admin UI for KB management, past-conversation transcripts, embed
  snippet generator. Single-password gate (no Clerk/Auth0).

Architecture is deliberately small (~3,500 LOC, 3 Supabase tables).
Tools live entirely at qlaud (an Anthropic billing/runtime layer):
built-ins for Resend, Slack, Linear, Zendesk, GitHub, Notion, Twilio,
plus an MCP catalog with Stripe, Shopify, HubSpot, Cal.com, etc.
customerdog sends `tools_mode: "tenant"` and qlaud auto-attaches
whatever the operator tenant-shared in their dashboard. Streaming +
tool dispatch share a single SSE — Anthropic's standard
`content_block_*` events interleaved with qlaud's
`tool_dispatch_start/done` events.

What it deliberately isn't: a multi-tenant SaaS, an agent framework, a
vector DB. The KB lives as plain text concatenated into a
`cache_control: ephemeral` system prompt — Anthropic's prompt cache
makes the long context cheap (~10% of an uncached turn), so no
embedding pipeline, no retrieval. Works great for a typical B2B SaaS
docs corpus (~20-80K tokens). Bigger KBs would want retrieval, which is
straightforward to bolt on.

Setup is genuinely 5 minutes:

1. Click the Vercel deploy button → fill in 7 env vars (qlaud key, three
   Supabase values, two random secrets, your deploy URL).
2. First admin page load auto-runs `schema.sql` against Supabase via
   direct Postgres.
3. Paste your docs URL in `/admin/kb` (or crawl a whole sitemap).
4. In your qlaud dashboard, enable a couple of built-ins (e.g. Resend
   for email, Linear for tickets) and tenant-share them.
5. Drop the `<script>` snippet on your site.

Code: https://github.com/customerdog/customerdog
Demo: https://customerdogclone.vercel.app  ← anonymous chat with our docs
Site: https://customerdog.com  ← (placeholder; replace before posting)

Happy to dig into the trade-offs in comments — why no vector DB, why
qlaud over rolling our own agent loop, why Supabase over Turso/D1, why
single-tenant per clone instead of multi-tenant SaaS, etc.

---

## After posting checklist

- [ ] Engage in comments quickly (first 30 minutes are critical for HN
      ranking)
- [ ] Be honest about limitations (the "deliberately isn't" paragraph
      saves a lot of "but does it…?" comments)
- [ ] Don't sneak edit the post for marketing — moderators frown on it
- [ ] Have the demo working (anonymous, no signup gate, KB pre-loaded
      with docs the AI can answer from). Currently:
      https://customerdogclone.vercel.app
- [ ] Have a live "talk to it" link that works on mobile
- [ ] Pin a "the deploy button worked? what broke?" comment so feedback
      lands somewhere visible

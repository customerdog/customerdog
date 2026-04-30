# Screenshots referenced from the main README

Drop PNGs here with these exact filenames so the README renders them:

| Filename | What it shows |
|---|---|
| `01-visitor-chat.png` | Anonymous visitor in `/chat` (or the embed widget) typing a real question and getting a streaming, markdown-formatted answer from the KB. The killer demo. |
| `02-admin-dashboard.png` | `/admin` after sign-in. Four cards: Knowledge base / Conversations / Settings / Embed widget, plus the qlaud.ai/tools footer note. |
| `03-admin-kb.png` | `/admin/kb` with a populated source list (URLs, plus ideally a pasted markdown row). The "Crawl an entire docs site" form should be visible. |
| `04-admin-settings.png` | `/admin/settings` with the four config fields: company name, brand color, support email, system-prompt extras. |
| `05-admin-conversations.png` | `/admin/conversations` showing at least one past visitor session. (Optionally also include `/admin/conversations/[id]` transcript view as a second image.) |
| `06-admin-embed.png` | `/admin/embed` with the snippet, optional-attributes hint, and the live iframe preview. |

## Conventions

- **Format**: PNG (or webp if smaller). Keep each file under 500 KB —
  GitHub README rendering loads them inline.
- **Width**: 1200-1600 px wide. They'll scale down responsively in
  GitHub's renderer; bigger source = sharper at retina.
- **Crop**: tight to the actual UI. Trim browser chrome unless it's
  meaningful (e.g., the URL bar showing `support.yourcompany.com`).
- **Light mode**: customerdog ships light-mode-only, so screenshots
  should match that.

After dropping the files in here, the main README will render them
automatically — no markdown changes needed.

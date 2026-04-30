-- ──────────────────────────────────────────────────────────────────────
-- customerdog — Supabase schema
--
-- One-time setup: paste this whole file into Supabase SQL Editor and run.
-- (Project → SQL Editor → "+ New query" → paste → Run)
--
-- Idempotent: safe to re-run on an existing DB. Uses IF NOT EXISTS / ON
-- CONFLICT so additive changes can be applied without dropping data.
-- ──────────────────────────────────────────────────────────────────────

-- ─── config ────────────────────────────────────────────────────────────
-- Single-row table. Holds the company's brand + system-prompt extras.
-- Tool dispatch / ticket destinations live entirely in qlaud now —
-- this row is purely about how customerdog presents itself to visitors.
-- Edited via /admin/settings (or directly in Supabase Table Editor).
CREATE TABLE IF NOT EXISTS config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'Your Company',
  brand_color TEXT NOT NULL DEFAULT '#dc2626',
  support_email TEXT,                    -- shown to visitor on errors
  system_prompt_extras TEXT,             -- appended to the AI's system prompt
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single config row if it doesn't exist.
INSERT INTO config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── kb_sources ────────────────────────────────────────────────────────
-- The knowledge base. Each row is one URL we crawled + parsed, or one
-- pasted markdown blob. The server concatenates active rows into a
-- single system prompt at request time, with cache_control: ephemeral
-- so Anthropic's prompt cache makes the long context cheap.
CREATE TABLE IF NOT EXISTS kb_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('url', 'markdown', 'pasted')),
  source TEXT NOT NULL,                  -- the URL, or a label for pasted content
  parsed_content TEXT NOT NULL,          -- the extracted plain-text / markdown
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_sources_active_idx ON kb_sources (active);

-- ─── conversations ─────────────────────────────────────────────────────
-- One row per anonymous visitor session. The transcript itself lives in
-- qlaud (qlaud_thread_id); this row is just the metadata so the admin
-- dashboard can list past sessions + look up transcripts by thread id.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_visitor_id TEXT NOT NULL,         -- from cd_visitor cookie
  qlaud_thread_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS conversations_visitor_idx
  ON conversations (anon_visitor_id);
CREATE INDEX IF NOT EXISTS conversations_thread_idx
  ON conversations (qlaud_thread_id);
CREATE INDEX IF NOT EXISTS conversations_started_idx
  ON conversations (started_at DESC);

-- ─── notes ─────────────────────────────────────────────────────────────
-- Removed in cleanup (qlaud now owns tool dispatch + audit):
--   • `actions` table (tool action audit log)
--   • `tool_registrations` table (HMAC secrets for our webhooks)
-- These no longer ship in customerdog. Existing deploys may still have
-- them sitting orphaned — drop manually if you want to clean up:
--   DROP TABLE IF EXISTS actions;
--   DROP TABLE IF EXISTS tool_registrations;
--
-- Row-level security is intentionally NOT enabled here. customerdog
-- accesses Supabase exclusively via the service-role key from server-
-- side code (never browser); the database is gated by the API key, not
-- by per-row policies. If you expose Supabase to the browser (e.g., add
-- a customer-facing dashboard with the anon key), turn RLS on first.

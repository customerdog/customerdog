-- One row per Clerk user. Mirrors the bits of identity we need locally
-- (email + Clerk id) and binds each user to their qlaud per-user key +
-- their first thread. Created by the /api/webhooks/clerk handler on the
-- user.created event.
--
-- The qlaud_secret is stored verbatim because the qlaud API doesn't
-- support reissuing a key; we'd have to revoke + remint to rotate, which
-- destroys the per-user spend cap audit trail. Encrypt-at-rest is via
-- Supabase's storage layer; secrets never appear in client bundles.
create table users (
  clerk_user_id text primary key,
  email text not null,
  qlaud_key_id text not null,
  qlaud_secret text not null,
  qlaud_initial_thread_id text not null,
  created_at timestamptz default now()
);

create index users_email_idx on users (email);

-- RLS: a signed-in user can only see their own row. Service-role bypasses
-- this, so server-side handlers (the Clerk webhook, the chat route) work.
alter table users enable row level security;

-- We use Clerk JWTs in Supabase via a third-party auth provider; the
-- `sub` claim holds the Clerk user id. The policy below assumes you've
-- configured Supabase to accept Clerk JWTs (Settings → Auth → Third-party
-- auth → Add Clerk). Without that integration, only service-role calls
-- can read this table — which is fine for server-side use.
create policy "user can read own row"
  on users for select
  using (auth.jwt() ->> 'sub' = clerk_user_id);

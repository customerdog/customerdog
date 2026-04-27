-- Backing store for the save_to_drive demo tool.
create table drive_items (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text references users(clerk_user_id) on delete cascade,
  thread_id text,
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

create index drive_items_user_idx on drive_items (clerk_user_id, created_at desc);

alter table drive_items enable row level security;

create policy "user can read own drive items" on drive_items for select
  using (auth.jwt() ->> 'sub' = clerk_user_id);

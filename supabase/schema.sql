-- Fuel Log: account sync table.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Each row is one piece of a user's data: a log entry (entry:<id>), a custom
-- food (food:<id>), or their goals / settings / recent foods. Rows are never
-- hard-deleted by the app; a deletion is a row with deleted = true so other
-- devices learn about it.

create table if not exists public.sync_items (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  kind        text        not null,
  data        jsonb,
  deleted     boolean     not null default false,
  updated_at  bigint      not null,            -- when the change was made (device clock, ms)
  modified_at timestamptz not null default now(), -- when the server stored it (sync cursor)
  primary key (user_id, id)
);

create index if not exists sync_items_user_modified on public.sync_items (user_id, modified_at);

-- Last write wins: ignore an upload that is older than what is stored, and
-- stamp every stored change with the server's clock.
create or replace function public.sync_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.modified_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sync_items_guard on public.sync_items;
create trigger sync_items_guard
  before insert or update on public.sync_items
  for each row execute function public.sync_items_guard();

-- Each user can only see and change their own rows.
alter table public.sync_items enable row level security;

drop policy if exists "own rows: read" on public.sync_items;
create policy "own rows: read" on public.sync_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own rows: add" on public.sync_items;
create policy "own rows: add" on public.sync_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "own rows: change" on public.sync_items;
create policy "own rows: change" on public.sync_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.sync_items to authenticated;

-- Live updates: lets an open app hear about changes from your other devices
-- right away instead of on next open.
do $$
begin
  alter publication supabase_realtime add table public.sync_items;
exception when duplicate_object then null;
end $$;

-- Garmin: each user's Garmin Personal API key, so every signed-in device can
-- pull from Garmin without pasting the key again. Only the "garmin" Edge
-- Function reads or writes it (acting as the signed-in user); the app never
-- reads it back. Run this block once, like the rest of this file.
create table if not exists public.garmin_keys (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  api_key    text        not null,
  updated_at timestamptz not null default now()
);

alter table public.garmin_keys enable row level security;

drop policy if exists "own key" on public.garmin_keys;
create policy "own key" on public.garmin_keys
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.garmin_keys to authenticated;

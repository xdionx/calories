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

-- Households: share a grocery list and the week's meals with family.
-- Run this block once, like the rest of this file. A household has a short
-- join code; anyone signed in who enters it becomes a member. Members can read
-- and change the household's shared rows (grocery items, planned meals,
-- chosen store, aisle numbers) and nothing else of each other's data.

create table if not exists public.households (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  code       text        not null unique,
  created_by uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid        not null references public.households (id) on delete cascade,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  email        text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_items (
  household_id uuid        not null references public.households (id) on delete cascade,
  id           text        not null,
  kind         text        not null,
  data         jsonb,
  deleted      boolean     not null default false,
  updated_at   bigint      not null,
  modified_at  timestamptz not null default now(),
  primary key (household_id, id)
);
create index if not exists household_items_modified on public.household_items (household_id, modified_at);

-- Is the signed-in user in this household? (Security definer so the policies
-- below don't recurse into household_members.)
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = (select auth.uid()));
$$;

create or replace function public.household_items_guard()
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
drop trigger if exists household_items_guard on public.household_items;
create trigger household_items_guard
  before insert or update on public.household_items
  for each row execute function public.household_items_guard();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_items enable row level security;

drop policy if exists "members: read household" on public.households;
create policy "members: read household" on public.households
  for select to authenticated using (public.is_household_member(id));

drop policy if exists "members: read members" on public.household_members;
create policy "members: read members" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "members: read items" on public.household_items;
create policy "members: read items" on public.household_items
  for select to authenticated using (public.is_household_member(household_id));
drop policy if exists "members: add items" on public.household_items;
create policy "members: add items" on public.household_items
  for insert to authenticated with check (public.is_household_member(household_id));
drop policy if exists "members: change items" on public.household_items;
create policy "members: change items" on public.household_items
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant select on public.households, public.household_members to authenticated;
grant select, insert, update on public.household_items to authenticated;

-- Create a household (you become its first member) and get its join code.
create or replace function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.households;
  c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.households where code = c);
  end loop;
  insert into public.households (name, code) values (left(trim(household_name), 60), c) returning * into h;
  insert into public.household_members (household_id, email) values (h.id, auth.jwt() ->> 'email');
  return h;
end;
$$;

-- Join with a code.
create or replace function public.join_household(join_code text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.households;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into h from public.households where code = upper(trim(join_code));
  if not found then raise exception 'No household has that code'; end if;
  insert into public.household_members (household_id, email) values (h.id, auth.jwt() ->> 'email')
    on conflict (household_id, user_id) do nothing;
  return h;
end;
$$;

create or replace function public.leave_household(hid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.household_members where household_id = hid and user_id = (select auth.uid());
$$;

revoke all on function public.create_household(text), public.join_household(text), public.leave_household(uuid) from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.leave_household(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.household_items;
exception when duplicate_object then null;
end $$;

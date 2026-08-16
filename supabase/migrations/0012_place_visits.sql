-- Guided — Personal "visited" marks
--
-- Per-user, private state: a row records that ONE user has been to ONE place.
-- Places are shared across collaborators, so "visited" must live outside the
-- places row (each member marks independently, and nobody sees anyone else's
-- marks). This is the same per-user-private pattern as layer hide/collapse,
-- but here it needs to survive across the user's devices, so it's server-backed
-- rather than local-only.
--
-- Privacy is enforced entirely by RLS: every policy is a DIRECT column check
-- (user_id = auth.uid()), never a self-referential subquery, so it sidesteps the
-- INSERT ... RETURNING SELECT-policy trap (see 0004). A user can only ever read,
-- create, or delete their own rows.

create table if not exists public.place_visits (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- FK lookup / cascade support: places delete by place_id.
create index if not exists place_visits_place_id_idx on public.place_visits (place_id);

alter table public.place_visits enable row level security;

-- A user sees and manages only their own visit marks. No UPDATE policy: this is
-- a presence table (toggle = insert to mark, delete to unmark).
drop policy if exists place_visits_select on public.place_visits;
drop policy if exists place_visits_insert on public.place_visits;
drop policy if exists place_visits_delete on public.place_visits;

create policy place_visits_select on public.place_visits
  for select using (user_id = auth.uid());
create policy place_visits_insert on public.place_visits
  for insert with check (user_id = auth.uid());
create policy place_visits_delete on public.place_visits
  for delete using (user_id = auth.uid());

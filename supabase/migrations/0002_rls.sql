-- Guided — Phase 0/1 Row Level Security
-- Helpers are SECURITY DEFINER so they read guides/guide_shares with RLS
-- bypassed internally, avoiding policy recursion.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_guide_owner(p_guide_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.guides g
    where g.id = p_guide_id and g.owner_id = auth.uid()
  );
$$;

-- Owner, or a user with an accepted share membership for the guide.
create or replace function public.can_read_guide(p_guide_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.guides g where g.id = p_guide_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from public.guide_shares s
    where s.guide_id = p_guide_id
      and s.shared_with = auth.uid()
      and s.status = 'accepted'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.guides       enable row level security;
alter table public.layers       enable row level security;
alter table public.places       enable row level security;
alter table public.guide_shares enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: a user reads/updates only their own row (rows are created by trigger)
-- ---------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- guides: read if owner or shared; write if owner
-- ---------------------------------------------------------------------------
create policy guides_select on public.guides
  for select using (public.can_read_guide(id));
create policy guides_insert on public.guides
  for insert with check (owner_id = auth.uid());
create policy guides_update on public.guides
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy guides_delete on public.guides
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- layers: read if can read parent guide; write if owner of parent
-- ---------------------------------------------------------------------------
create policy layers_select on public.layers
  for select using (public.can_read_guide(guide_id));
create policy layers_insert on public.layers
  for insert with check (public.is_guide_owner(guide_id));
create policy layers_update on public.layers
  for update using (public.is_guide_owner(guide_id)) with check (public.is_guide_owner(guide_id));
create policy layers_delete on public.layers
  for delete using (public.is_guide_owner(guide_id));

-- ---------------------------------------------------------------------------
-- places: read if can read parent guide; write if owner of parent (phase 0).
-- Phase 2 adds editor-role INSERT + self-edit policies.
-- ---------------------------------------------------------------------------
create policy places_select on public.places
  for select using (public.can_read_guide(guide_id));
create policy places_insert on public.places
  for insert with check (public.is_guide_owner(guide_id));
create policy places_update on public.places
  for update using (public.is_guide_owner(guide_id)) with check (public.is_guide_owner(guide_id));
create policy places_delete on public.places
  for delete using (public.is_guide_owner(guide_id));

-- ---------------------------------------------------------------------------
-- guide_shares: owner manages links/memberships; a member sees their own row.
-- Membership rows are created via accept_share_token() (SECURITY DEFINER),
-- never by direct client insert.
-- ---------------------------------------------------------------------------
create policy guide_shares_select on public.guide_shares
  for select using (shared_with = auth.uid() or public.is_guide_owner(guide_id));
create policy guide_shares_insert on public.guide_shares
  for insert with check (public.is_guide_owner(guide_id));
create policy guide_shares_update on public.guide_shares
  for update using (public.is_guide_owner(guide_id)) with check (public.is_guide_owner(guide_id));
create policy guide_shares_delete on public.guide_shares
  for delete using (public.is_guide_owner(guide_id));

-- ---------------------------------------------------------------------------
-- accept_share_token: redeem a share link.
-- The owner creates a "link" row (shared_with is null). Redeeming inserts a
-- per-user membership row (shared_with = caller) with the link's role, so one
-- link works for many recipients. Returns the guide_id to navigate to.
-- ---------------------------------------------------------------------------
create or replace function public.accept_share_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link  public.guide_shares%rowtype;
  v_owner uuid;
begin
  select * into v_link
  from public.guide_shares
  where token = p_token and shared_with is null
  limit 1;

  if not found then
    raise exception 'invalid_or_expired_share_token' using errcode = 'no_data_found';
  end if;

  select owner_id into v_owner from public.guides where id = v_link.guide_id;

  -- Owner opening their own link: nothing to grant.
  if v_owner = auth.uid() then
    return v_link.guide_id;
  end if;

  insert into public.guide_shares (guide_id, role, shared_with, status)
  values (v_link.guide_id, v_link.role, auth.uid(), 'accepted')
  on conflict (guide_id, shared_with)
  do update set status = 'accepted', role = excluded.role;

  return v_link.guide_id;
end;
$$;

grant execute on function public.accept_share_token(uuid) to authenticated;

-- Guided — Phase 2: editor-role writes on places + layers
--
-- Phase 0/1 locked all child-table writes to the guide owner (is_guide_owner).
-- Phase 2 lets a user who accepted an *editor* share link add/edit/delete the
-- guide's places and layers. Guide metadata (name/emoji/color/pinned), sharing,
-- and delete-guide stay owner-only, so guides/guide_shares policies are untouched.

-- ---------------------------------------------------------------------------
-- Helper: owner OR an accepted editor member of the guide.
--
-- SECURITY DEFINER + reads only the PARENT tables (guides / guide_shares), never
-- places/layers themselves. That matters for INSERT ... RETURNING: supabase-js
-- upserts with return=representation, so Postgres re-checks the row against the
-- table's SELECT policy mid-insert. A helper that re-queried the table being
-- written would not see the not-yet-committed row and would wrongly reject it
-- (the 42501 trap fixed for guides in 0004). Because this helper only touches
-- parent tables it is safe to use in places/layers WITH CHECK. Outer columns are
-- passed in as parameters, so there is no ambiguous-column capture (the 0005 trap).
create or replace function public.can_edit_guide(p_guide_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.guides g
    where g.id = p_guide_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from public.guide_shares s
    where s.guide_id = p_guide_id
      and s.shared_with = auth.uid()
      and s.status = 'accepted'
      and s.role = 'editor'
  );
$$;

-- ---------------------------------------------------------------------------
-- layers: editors may write; readers unchanged (can_read_guide covers them).
-- ---------------------------------------------------------------------------
drop policy if exists layers_insert on public.layers;
drop policy if exists layers_update on public.layers;
drop policy if exists layers_delete on public.layers;

create policy layers_insert on public.layers
  for insert with check (public.can_edit_guide(guide_id));
create policy layers_update on public.layers
  for update using (public.can_edit_guide(guide_id)) with check (public.can_edit_guide(guide_id));
create policy layers_delete on public.layers
  for delete using (public.can_edit_guide(guide_id));

-- ---------------------------------------------------------------------------
-- places: editors may write. INSERT also pins attribution: a non-owner editor
-- must stamp added_by = themselves (can't forge another member's authorship);
-- the owner may set any added_by (e.g. the one-time local-guide upload migration
-- writes owner-authored places).
-- ---------------------------------------------------------------------------
drop policy if exists places_insert on public.places;
drop policy if exists places_update on public.places;
drop policy if exists places_delete on public.places;

create policy places_insert on public.places
  for insert with check (
    public.can_edit_guide(guide_id)
    and (public.is_guide_owner(guide_id) or added_by = auth.uid())
  );
create policy places_update on public.places
  for update using (public.can_edit_guide(guide_id)) with check (public.can_edit_guide(guide_id));
create policy places_delete on public.places
  for delete using (public.can_edit_guide(guide_id));

grant execute on function public.can_edit_guide(uuid) to authenticated;

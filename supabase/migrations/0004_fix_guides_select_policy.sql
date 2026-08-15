-- Fix: guides INSERT fails with 42501 because supabase-js upserts with
-- `RETURNING` (return=representation), which makes Postgres apply the SELECT
-- policy to the just-inserted row. The old SELECT policy routed the ownership
-- check through can_read_guide(id), a SECURITY DEFINER function that re-queries
-- public.guides by id — and the new row isn't visible to that sub-SELECT during
-- INSERT ... RETURNING, so it returns false and the read-back is rejected.
--
-- Check owner_id directly on the row instead (no self-referential re-query).
-- The shared-viewer branch queries guide_shares (a different table), so it's
-- unaffected by the same-statement visibility rule.

drop policy if exists guides_select on public.guides;

create policy guides_select on public.guides
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.guide_shares s
      where s.guide_id = id
        and s.shared_with = auth.uid()
        and s.status = 'accepted'
    )
  );

-- layers/places are unaffected: their SELECT policies call can_read_guide on the
-- PARENT guide_id, which already exists and is visible, so no change needed here.

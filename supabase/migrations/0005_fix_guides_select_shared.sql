-- Fix: shared users get "guide not found" even with an accepted guide_shares row.
--
-- The guides_select policy from 0004 wrote `where s.guide_id = id` in the
-- correlated subquery. Because guide_shares ALSO has an `id` column, Postgres
-- resolves the unqualified `id` to the inner table (guide_shares.id), not
-- guides.id — so the check is really `s.guide_id = s.id`, which is never true.
-- Result: the shared-viewer branch always fails and RLS hides the guide.
--
-- Qualify the outer row's column explicitly as `guides.id`.

drop policy if exists guides_select on public.guides;

create policy guides_select on public.guides
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.guide_shares s
      where s.guide_id = guides.id
        and s.shared_with = auth.uid()
        and s.status = 'accepted'
    )
  );

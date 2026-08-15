-- Let a guide's owner read the profiles of the people they've shared it with, so
-- the settings page can list members by name/avatar instead of raw user ids.
-- (0006 covered the reverse direction: a recipient reading the owner's profile.)
--
-- SECURITY DEFINER so the guides/guide_shares lookup runs with RLS bypassed
-- internally, matching is_guide_owner / can_read_guide and avoiding recursion.
create or replace function public.is_member_of_my_guide(p_member uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.guide_shares s
    join public.guides g on g.id = s.guide_id
    where g.owner_id = auth.uid()
      and s.shared_with = p_member
  );
$$;

-- Permissive: ORs with the existing profiles policies.
create policy profiles_select_my_members on public.profiles
  for select using (public.is_member_of_my_guide(id));

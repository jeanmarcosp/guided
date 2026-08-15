-- Let a user read the profile of anyone who has shared a guide with them, so the
-- app can show "Shared by <name>". Without this, profiles_select_self limits
-- reads to your own row and shared guides show no owner.
--
-- SECURITY DEFINER so the guides/guide_shares lookup runs with RLS bypassed
-- internally (matches is_guide_owner / can_read_guide), avoiding policy recursion.
create or replace function public.owner_shares_with_me(p_owner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.guides g
    join public.guide_shares s on s.guide_id = g.id
    where g.owner_id = p_owner
      and s.shared_with = auth.uid()
      and s.status = 'accepted'
  );
$$;

-- Permissive: ORs with profiles_select_self, so this only widens reads to the
-- owners of guides actually shared with the caller (never all profiles).
create policy profiles_select_shared_owner on public.profiles
  for select using (public.owner_shares_with_me(id));

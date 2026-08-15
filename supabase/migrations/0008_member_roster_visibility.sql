-- Broaden visibility so any collaborator (owner or accepted member) can see the
-- full member roster, and resolve co-members' names — not just the owner.

-- guide_shares: a member may read the OTHER member rows (shared_with not null),
-- but NOT the link row (shared_with null), which holds the shareable token — that
-- stays owner-only so viewers can't re-share. Owner still sees all via is_guide_owner.
drop policy if exists guide_shares_select on public.guide_shares;
create policy guide_shares_select on public.guide_shares
  for select using (
    shared_with = auth.uid()
    or public.is_guide_owner(guide_id)
    or (shared_with is not null and public.can_read_guide(guide_id))
  );

-- profiles: replace the two one-directional policies (0006 recipient->owner,
-- 0007 owner->members) with one symmetric check: I can read a profile if that
-- person and I are both on the same guide (as owner or accepted member). This
-- also lets co-members see each other.
drop policy if exists profiles_select_shared_owner on public.profiles;
drop policy if exists profiles_select_my_members on public.profiles;
drop function if exists public.owner_shares_with_me(uuid);
drop function if exists public.is_member_of_my_guide(uuid);

create or replace function public.shares_a_guide_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.guides g
    where (
            g.owner_id = auth.uid()
            or exists (
              select 1 from public.guide_shares s
              where s.guide_id = g.id and s.shared_with = auth.uid() and s.status = 'accepted'
            )
          )
      and (
            g.owner_id = p_other
            or exists (
              select 1 from public.guide_shares s
              where s.guide_id = g.id and s.shared_with = p_other and s.status = 'accepted'
            )
          )
  );
$$;

create policy profiles_select_covisible on public.profiles
  for select using (public.shares_a_guide_with(id));

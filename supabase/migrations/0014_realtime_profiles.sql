-- Guided — publish profiles for Realtime so avatar/name changes propagate live
--
-- Member avatars + names shown in the home-card cluster and rosters come from
-- `profiles`, resolved into each Guide's members/ownerName (lib/api/guides.ts).
-- Without realtime those only refreshed on app foreground, so a collaborator
-- editing their avatar color/image or display name didn't show until the other
-- device was backgrounded and reopened. Publishing profiles lets realtime.ts
-- applyProfile() apply the change live.
--
-- Delivery stays governed by RLS: a subscriber receives a profile row change
-- only if their SELECT policy permits reading it — profiles_select_self (own
-- row) or the shared-guide policies (0006/0007, via SECURITY DEFINER helpers
-- that read guides/guide_shares, not profile columns, so UPDATE authorizes fine).
-- Idempotent, matching 0010/0011. REPLICA IDENTITY FULL for consistency (and so
-- any future old-row RLS check has every column).

alter table public.profiles replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;

-- Guided — Phase 2: DELETE propagation + live permission changes
--
-- Two additive, idempotent fixes on top of 0010 (kept separate so `supabase db
-- push` applies them even if 0010 was already applied — editing an applied
-- migration is a no-op).
--
-- 1. REPLICA IDENTITY FULL on the realtime tables. Realtime authorizes a DELETE
--    by evaluating the table's SELECT policy against the OLD row, and those
--    policies read guide_id / shared_with. The default replica identity puts only
--    the primary key in the OLD row, so RLS can't authorize the event and the
--    DELETE is never delivered. FULL puts every column in the OLD row — so place
--    and layer removals (and share revokes below) reach collaborators live.
--
-- 2. Publish guide_shares so a member's role change (viewer↔editor) and revokes
--    propagate live to the affected member (realtime.ts applyShare()). Without
--    this, a promoted viewer keeps a stale role until the next foreground refresh
--    or app restart — so the Add/Layers controls (gated on role) never appear.

alter table public.guides       replica identity full;
alter table public.layers       replica identity full;
alter table public.places       replica identity full;
alter table public.guide_shares replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guide_shares'
  ) then
    alter publication supabase_realtime add table public.guide_shares;
  end if;
end
$$;

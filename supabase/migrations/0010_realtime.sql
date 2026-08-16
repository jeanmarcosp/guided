-- Guided — Phase 2: publish the collaborative tables for Realtime
--
-- Adds guides/layers/places to the `supabase_realtime` publication so clients can
-- subscribe to postgres_changes. Row-level delivery is still governed by RLS (the
-- SELECT policies via can_read_guide), so a subscriber only receives changes for
-- guides they own or have an accepted share on.
--
-- NOTE: DELETE propagation and live permission changes (guide_shares) require
-- REPLICA IDENTITY FULL and publishing guide_shares — added in 0011_realtime_shares.sql.

-- The publication exists by default on Supabase projects. Create it if missing so
-- a fresh/self-hosted database also works, then add each table idempotently
-- (ALTER PUBLICATION ... ADD TABLE errors if the table is already a member).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['guides', 'layers', 'places'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

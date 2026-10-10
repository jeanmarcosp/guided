-- 0018: add pin coordinates to the share-link preview
--
-- The preview worker now renders an Apple Maps Web Snapshot of the guide (like
-- Apple Maps guide shares), so it needs the places' coordinates. Anyone with
-- the token can already open the full guide in-app, so exposing coordinates to
-- token holders grants nothing new. Capped at 24 pins, oldest first.

create or replace function public.share_link_preview(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', g.name,
    'emoji', g.emoji,
    'color', g.color,
    'placeCount', (select count(*)::int from public.places p where p.guide_id = g.id),
    'placeNames', (
      select coalesce(jsonb_agg(t.name), '[]'::jsonb)
      from (
        select p.name
        from public.places p
        where p.guide_id = g.id
        order by p.created_at
        limit 3
      ) t
    ),
    'places', (
      select coalesce(jsonb_agg(jsonb_build_object('lat', t.latitude, 'lng', t.longitude)), '[]'::jsonb)
      from (
        select p.latitude, p.longitude
        from public.places p
        where p.guide_id = g.id
        order by p.created_at
        limit 24
      ) t
    ),
    'ownerName', coalesce(nullif(btrim(pr.display_name), ''), 'Someone'),
    'role', s.role
  )
  from public.guide_shares s
  join public.guides g on g.id = s.guide_id
  left join public.profiles pr on pr.id = g.owner_id
  where s.token = p_token
    and s.shared_with is null
$$;

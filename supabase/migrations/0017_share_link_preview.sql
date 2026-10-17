-- 0017: public share-link preview metadata
--
-- Link previews (iMessage, WhatsApp, Slack, …) scrape the share URL without
-- any auth, so the preview worker needs to resolve a token -> guide metadata
-- as `anon`. This RPC exposes the minimum needed to render a preview card:
-- name/emoji/color, place count, a few place names, and the owner's display
-- name. It never exposes emails, coordinates, or member lists, and only
-- resolves reusable link rows (shared_with is null) — the only tokens that
-- ever appear in a URL.

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
    'ownerName', coalesce(nullif(btrim(pr.display_name), ''), 'Someone'),
    'role', s.role
  )
  from public.guide_shares s
  join public.guides g on g.id = s.guide_id
  left join public.profiles pr on pr.id = g.owner_id
  where s.token = p_token
    and s.shared_with is null
$$;

revoke all on function public.share_link_preview(uuid) from public;
grant execute on function public.share_link_preview(uuid) to anon, authenticated;

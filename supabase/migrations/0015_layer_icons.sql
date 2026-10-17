-- Layers are moving from emoji to SF Symbol icons, but old clients still
-- read/write the emoji column — so this is ADDITIVE during development:
-- new builds write `icon` (and keep a legacy emoji for old clients); rows
-- written by old clients have a null icon and new clients derive it from the
-- emoji at read time (normalizeLayerIcon). A later migration drops `emoji`
-- and backfills icon once every client is on the new build.
alter table public.layers add column if not exists icon text;

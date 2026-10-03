-- Apple Maps stable Place IDs (MKMapItem.identifier, iOS 18+). Captured when a
-- place is added from Apple search so "open in Apple Maps" / the in-app place
-- card resolve the exact POI instead of fuzzy-matching by name+coordinate.
-- Additive: old clients ignore the column; rows they write leave it null and
-- those places keep using the fuzzy fallback.
alter table public.places add column if not exists apple_place_id text;

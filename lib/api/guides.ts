import { supabase } from '@/lib/supabase';
import type { Guide, GuideRole } from '@/lib/types';
import { guideRowsToGuide, type GuideRow, type LayerRow, type PlaceRow } from '@/lib/api/mappers';

/**
 * Fetch every guide the user can see (owned + shared, enforced by RLS) and
 * assemble them into the flat client `Guide` shape.
 */
export async function fetchGuides(userId: string): Promise<Guide[]> {
  const [{ data: guides, error: gErr }, { data: shares }] = await Promise.all([
    supabase.from('guides').select('*').order('sort_order', { ascending: true }),
    supabase
      .from('guide_shares')
      .select('guide_id, role')
      .eq('shared_with', userId)
      .eq('status', 'accepted'),
  ]);
  if (gErr) throw gErr;
  const guideRows = (guides ?? []) as GuideRow[];
  if (guideRows.length === 0) return [];

  const ids = guideRows.map((g) => g.id);
  // Owners of guides shared with us — for the "Shared by <name>" label.
  // profiles RLS only exposes these owners (see 0006_profiles_shared_owner.sql).
  type OwnerRow = { id: string; display_name: string | null; email: string | null };
  const sharedOwnerIds = [
    ...new Set(guideRows.filter((g) => g.owner_id !== userId).map((g) => g.owner_id)),
  ];
  const [{ data: layers, error: lErr }, { data: places, error: pErr }, { data: owners }] =
    await Promise.all([
      supabase.from('layers').select('*').in('guide_id', ids),
      supabase.from('places').select('*').in('guide_id', ids),
      sharedOwnerIds.length
        ? supabase.from('profiles').select('id, display_name, email').in('id', sharedOwnerIds)
        : Promise.resolve({ data: [] as OwnerRow[], error: null }),
    ]);
  if (lErr) throw lErr;
  if (pErr) throw pErr;

  const layerRows = (layers ?? []) as LayerRow[];
  const placeRows = (places ?? []) as PlaceRow[];
  const roleByGuide = new Map<string, GuideRole>(
    ((shares ?? []) as { guide_id: string; role: GuideRole }[]).map((s) => [s.guide_id, s.role]),
  );
  const ownerNameById = new Map<string, string>();
  for (const o of (owners ?? []) as OwnerRow[]) {
    const name = o.display_name ?? o.email;
    if (name) ownerNameById.set(o.id, name);
  }

  return guideRows.map((g) => {
    const owned = g.owner_id === userId;
    const role: GuideRole = owned ? 'owner' : (roleByGuide.get(g.id) ?? 'viewer');
    return guideRowsToGuide(
      g,
      layerRows.filter((l) => l.guide_id === g.id),
      placeRows.filter((p) => p.guide_id === g.id),
      role,
      owned ? undefined : ownerNameById.get(g.owner_id),
    );
  });
}

/**
 * Write-through the entire guide: upsert the guide, its layers and places, and
 * delete any rows that no longer exist locally. Owner-only in phase 0/1 (RLS
 * enforces it); phase 2 replaces this with granular, realtime-friendly writes.
 */
export async function pushGuide(guide: Guide, ownerId: string): Promise<void> {
  const guideRow = {
    id: guide.id,
    owner_id: ownerId,
    name: guide.name,
    emoji: guide.emoji,
    color: guide.color,
    pinned: guide.pinned ?? false,
    sort_order: 0, // per-guide ordering is written by reorderGuides()
  };
  const { error: gErr } = await supabase.from('guides').upsert(guideRow);
  if (gErr) throw gErr;

  const layers = guide.layers ?? [];
  // NOTE: hidden/collapsed are intentionally omitted — they're per-user view
  // state (each member hides/collapses independently), not shared guide data.
  const layerRows = layers.map((l, i) => ({
    id: l.id,
    guide_id: guide.id,
    name: l.name,
    color: l.color,
    emoji: l.emoji,
    kind: l.kind ?? null,
    sort_order: i,
  }));
  if (layerRows.length > 0) {
    const { error } = await supabase.from('layers').upsert(layerRows);
    if (error) throw error;
  }
  await deleteMissing(
    'layers',
    guide.id,
    layers.map((l) => l.id),
  );

  const placeRows = guide.places.map((p) => ({
    id: p.id,
    guide_id: guide.id,
    layer_id: p.layerId ?? null,
    name: p.name,
    address: p.address ?? null,
    latitude: p.latitude,
    longitude: p.longitude,
    category: p.category ?? null,
    added_by: p.addedBy ?? ownerId,
  }));
  if (placeRows.length > 0) {
    const { error } = await supabase.from('places').upsert(placeRows);
    if (error) throw error;
  }
  await deleteMissing(
    'places',
    guide.id,
    guide.places.map((p) => p.id),
  );
}

/** Delete child rows of a guide whose ids are no longer present locally. */
async function deleteMissing(table: 'layers' | 'places', guideId: string, keepIds: string[]) {
  let q = supabase.from(table).delete().eq('guide_id', guideId);
  if (keepIds.length > 0) q = q.not('id', 'in', `(${keepIds.join(',')})`);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteGuideRemote(guideId: string): Promise<void> {
  const { error } = await supabase.from('guides').delete().eq('id', guideId);
  if (error) throw error;
}

/** Persist guide list order (owner's own guides). */
export async function reorderGuidesRemote(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) => supabase.from('guides').update({ sort_order: i }).eq('id', id)),
  );
}

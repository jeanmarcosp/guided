import { supabase } from '@/lib/supabase';
import { resolveProfiles } from '@/lib/api/shares';
import type { Guide, GuideAccessMember, GuideRole, Layer, Place } from '@/lib/types';
import { guideRowsToGuide, type GuideRow, type LayerRow, type PlaceRow } from '@/lib/api/mappers';

/**
 * Fetch every guide the user can see (owned + shared, enforced by RLS) and
 * assemble them into the flat client `Guide` shape, including the list of
 * everyone with access (owner + accepted members) for the avatar cluster.
 */
export async function fetchGuides(userId: string): Promise<Guide[]> {
  const [{ data: guides, error: gErr }, { data: myShares }] = await Promise.all([
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
  const [{ data: layers, error: lErr }, { data: places, error: pErr }, { data: memberShares }] =
    await Promise.all([
      supabase.from('layers').select('*').in('guide_id', ids),
      supabase.from('places').select('*').in('guide_id', ids),
      // Everyone with an accepted membership on these guides. RLS returns all
      // members for guides we own, and co-members (+ ourselves) for shared ones.
      supabase
        .from('guide_shares')
        .select('guide_id, shared_with')
        .in('guide_id', ids)
        .eq('status', 'accepted')
        .not('shared_with', 'is', null),
    ]);
  if (lErr) throw lErr;
  if (pErr) throw pErr;

  const layerRows = (layers ?? []) as LayerRow[];
  const placeRows = (places ?? []) as PlaceRow[];
  const memberRows = (memberShares ?? []) as { guide_id: string; shared_with: string }[];
  const roleByGuide = new Map<string, GuideRole>(
    ((myShares ?? []) as { guide_id: string; role: GuideRole }[]).map((s) => [s.guide_id, s.role]),
  );

  // Resolve name + avatar once for everyone we'll render: owners + members + self.
  const nameIds = new Set<string>([userId]);
  for (const g of guideRows) nameIds.add(g.owner_id);
  for (const m of memberRows) nameIds.add(m.shared_with);
  const cardById = await resolveProfiles([...nameIds]);

  // Others with access per guide = owner + accepted members, minus the current
  // user (we never show ourselves in the roster), deduped, owner first.
  const membersByGuide = new Map<string, GuideAccessMember[]>();
  for (const g of guideRows) {
    const list: GuideAccessMember[] = [];
    const seen = new Set<string>();
    const add = (uid: string) => {
      if (uid === userId || seen.has(uid)) return;
      seen.add(uid);
      const card = cardById.get(uid);
      list.push({
        userId: uid,
        name: card?.name ?? '',
        avatarUrl: card?.avatarUrl,
        avatarColor: card?.avatarColor,
      });
    };
    add(g.owner_id);
    for (const m of memberRows) if (m.guide_id === g.id) add(m.shared_with);
    membersByGuide.set(g.id, list);
  }

  return guideRows.map((g) => {
    const owned = g.owner_id === userId;
    const role: GuideRole = owned ? 'owner' : (roleByGuide.get(g.id) ?? 'viewer');
    return guideRowsToGuide(
      g,
      layerRows.filter((l) => l.guide_id === g.id),
      placeRows.filter((p) => p.guide_id === g.id),
      role,
      owned ? undefined : cardById.get(g.owner_id)?.name,
      membersByGuide.get(g.id) ?? [],
    );
  });
}

// ---------------------------------------------------------------------------
// Granular, realtime-friendly writes (phase 2)
//
// The reactive write-through (lib/sync/guidesSync.ts) uses these instead of the
// whole-guide pushGuide(): a single row per user edit. This is what makes
// concurrent editing safe — no whole-guide upsert + delete-missing that could
// wipe a change another collaborator made between our last fetch and this write.
// RLS (0009) allows owners and accepted editors; viewers are blocked server-side.
// ---------------------------------------------------------------------------

/**
 * Insert one new place. `added_by` defaults to the acting user so an editor's
 * adds are attributed to (and authorized as) them — the places_insert policy
 * requires a non-owner's added_by to equal auth.uid(). A concurrent add of the
 * same coordinate collides on the `places_guide_coord_uniq` index (Postgres
 * 23505); we swallow it as "already added" and let realtime deliver the winner.
 *
 * Inserts and updates are deliberately separate calls: an upsert would be
 * INSERT ... ON CONFLICT DO UPDATE, and Postgres still checks the INSERT policy's
 * WITH CHECK on the update path — which would reject an editor touching a place
 * the owner authored (added_by ≠ the editor). update goes through updatePlaceRemote.
 */
export async function insertPlaceRemote(
  place: Place,
  guideId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('places').insert({
    id: place.id,
    guide_id: guideId,
    layer_id: place.layerId ?? null,
    name: place.name,
    address: place.address ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    category: place.category ?? null,
    added_by: place.addedBy ?? userId,
  });
  if (error) {
    if (error.code === '23505') return; // coordinate/id dedupe: already present
    throw error;
  }
}

/** Update an existing place by id. Authorship (`added_by`) is never reassigned. */
export async function updatePlaceRemote(place: Place): Promise<void> {
  const { error } = await supabase
    .from('places')
    .update({
      layer_id: place.layerId ?? null,
      name: place.name,
      address: place.address ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category ?? null,
    })
    .eq('id', place.id);
  if (error) throw error;
}

export async function deletePlaceRemote(placeId: string): Promise<void> {
  const { error } = await supabase.from('places').delete().eq('id', placeId);
  if (error) throw error;
}

/**
 * Upsert one layer. `hidden`/`collapsed` are intentionally omitted — they're
 * per-user view state, not shared guide data (matches pushGuide()).
 */
export async function upsertLayerRemote(
  layer: Layer,
  guideId: string,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase.from('layers').upsert({
    id: layer.id,
    guide_id: guideId,
    name: layer.name,
    color: layer.color,
    emoji: layer.emoji,
    kind: layer.kind ?? null,
    sort_order: sortOrder,
  });
  if (error) throw error;
}

export async function deleteLayerRemote(layerId: string): Promise<void> {
  const { error } = await supabase.from('layers').delete().eq('id', layerId);
  if (error) throw error;
}

/**
 * Upsert guide-level metadata (owner-only per RLS). `sort_order` is deliberately
 * omitted so a rename/restyle doesn't reset list order — that's written
 * separately by reorderGuidesRemote(); a brand-new guide inserts with the column
 * default (0) and gets its real position on the next reorder.
 */
export async function upsertGuideMetaRemote(guide: Guide, ownerId: string): Promise<void> {
  const { error } = await supabase.from('guides').upsert({
    id: guide.id,
    owner_id: ownerId,
    name: guide.name,
    emoji: guide.emoji,
    color: guide.color,
    pinned: guide.pinned ?? false,
  });
  if (error) throw error;
}

/**
 * Write-through the entire guide: upsert the guide, its layers and places, and
 * delete any rows that no longer exist locally. Used only for the one-time
 * upload of an owner's pre-account local guides (uploadLocalGuidesOnce) — a
 * bulk insert with no concurrency. The reactive sync path uses the granular
 * writers above instead.
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

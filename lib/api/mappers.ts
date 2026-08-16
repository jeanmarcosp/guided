import type { Guide, GuideAccessMember, GuideRole, Layer, Place } from '@/lib/types';

// ---------------------------------------------------------------------------
// Database row shapes (snake_case, as returned by Supabase)
// ---------------------------------------------------------------------------
export type GuideRow = {
  id: string;
  owner_id: string;
  name: string;
  emoji: string;
  color: string;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LayerRow = {
  id: string;
  guide_id: string;
  name: string;
  color: string;
  emoji: string;
  kind: string | null;
  hidden: boolean;
  collapsed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlaceRow = {
  id: string;
  guide_id: string;
  layer_id: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

const ms = (iso: string) => new Date(iso).getTime();

export function layerRowToLayer(r: LayerRow): Layer {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    emoji: r.emoji,
    kind: r.kind ?? undefined,
    // hidden/collapsed are per-user view state, not synced guide data. Ignore the
    // server value and default to visible/expanded; the current user's local
    // choice is carried over on hydrate/refresh (see preserveLayerViewState).
    hidden: false,
    collapsed: false,
  };
}

export function placeRowToPlace(r: PlaceRow): Place {
  return {
    id: r.id,
    name: r.name,
    address: r.address ?? undefined,
    latitude: r.latitude,
    longitude: r.longitude,
    category: r.category ?? undefined,
    addedAt: ms(r.created_at),
    layerId: r.layer_id ?? undefined,
    addedBy: r.added_by ?? undefined,
  };
}

/** Assemble the flat client `Guide` the UI expects from normalized rows. */
export function guideRowsToGuide(
  guide: GuideRow,
  layers: LayerRow[],
  places: PlaceRow[],
  role: GuideRole,
  ownerName?: string,
  members: GuideAccessMember[] = [],
): Guide {
  return {
    id: guide.id,
    name: guide.name,
    emoji: guide.emoji,
    color: guide.color,
    pinned: guide.pinned,
    createdAt: ms(guide.created_at),
    ownerId: guide.owner_id,
    role,
    ownerName,
    members,
    layers: [...layers].sort((a, b) => a.sort_order - b.sort_order).map(layerRowToLayer),
    places: [...places].sort((a, b) => ms(a.created_at) - ms(b.created_at)).map(placeRowToPlace),
  };
}

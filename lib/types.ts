export type Place = {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  category?: string; // raw category from search, used for auto-routing
  addedAt: number;
  layerId?: string; // which layer this place belongs to
  addedBy?: string; // server user id of who added it (collaboration attribution)
};

export type Layer = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  /** Taxonomy key used to auto-route new places; undefined for custom layers. */
  kind?: string;
  hidden?: boolean; // pins hidden on the map
  collapsed?: boolean; // section collapsed in the list (does not hide pins)
};

/** The caller's relationship to a guide. Undefined for purely local guides. */
export type GuideRole = 'owner' | 'editor' | 'viewer';

/** A person with access to a guide (owner or accepted member) — for avatars. */
export type GuideAccessMember = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
};

export type Guide = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  places: Place[];
  createdAt: number;
  layers?: Layer[];
  pinned?: boolean;
  /** Server owner (auth user id). Undefined for un-synced local guides. */
  ownerId?: string;
  /** Caller's role for this guide; drives read-only vs editable UI. */
  role?: GuideRole;
  /** Owner's display name or email — set only for guides shared with the caller. */
  ownerName?: string;
  /** Other people with access (owner + accepted members, excluding self). Set by fetchGuides. */
  members?: GuideAccessMember[];
};

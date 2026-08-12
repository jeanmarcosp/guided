export type Place = {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  category?: string; // raw category from search, used for auto-routing
  addedAt: number;
  layerId?: string; // which layer this place belongs to
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

export type Guide = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  places: Place[];
  createdAt: number;
  layers?: Layer[];
  pinned?: boolean;
};

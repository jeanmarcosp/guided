import { uid } from '@/lib/id';
import type { Layer, Place } from '@/lib/types';

export type LayerTemplate = {
  kind: string;
  label: string;
  emoji: string;
  color: string;
};

/** Default layer templates used to auto-create layers from a place category. */
export const LAYER_TEMPLATES: LayerTemplate[] = [
  { kind: 'food', label: 'Food', emoji: '🍽️', color: '#FF3B30' },
  { kind: 'dessert', label: 'Sweet Treats', emoji: '🍰', color: '#FF2D55' },
  { kind: 'cafe', label: 'Coffee Shops', emoji: '☕️', color: '#FF9500' },
  { kind: 'bar', label: 'Nightlife', emoji: '🍸', color: '#AF52DE' },
  { kind: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#007AFF' },
  { kind: 'sights', label: 'Sights', emoji: '🏛️', color: '#5856D6' },
  { kind: 'outdoors', label: 'Outdoors', emoji: '🌳', color: '#34C759' },
  { kind: 'hotel', label: 'Stay', emoji: '🛏️', color: '#00C7BE' },
  { kind: 'other', label: 'Other', emoji: '📍', color: '#8E8E93' },
];

const TEMPLATE_BY_KIND: Record<string, LayerTemplate> = Object.fromEntries(
  LAYER_TEMPLATES.map((t) => [t.kind, t])
);

/** Palette offered in the layer editor. */
export const LAYER_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', '#007AFF', '#5856D6', '#AF52DE',
];

export const LAYER_EMOJIS = [
  '📍', '🍽️', '☕️', '🍸', '🛍️', '🏛️', '🌳', '🛏️',
  '🎨', '🎵', '🏖️', '⛰️', '🌮', '🍜', '🍷', '📸', '⭐️', '❤️',
];

// Keyword rules, checked in order — first match wins. Café/bar precede food so
// "coffee shop" and "wine bar" don't fall into shopping/food.
const RULES: { kind: string; keywords: string[] }[] = [
  { kind: 'cafe', keywords: ['cafe', 'café', 'coffee', 'espresso', 'tea', 'matcha', 'juice'] },
  { kind: 'bar', keywords: ['bar', 'pub', 'club', 'nightlife', 'brewery', 'beer', 'wine', 'cocktail', 'lounge', 'nightclub', 'speakeasy'] },
  { kind: 'dessert', keywords: ['dessert', 'ice cream', 'ice_cream', 'creamery', 'gelato', 'frozen yogurt', 'froyo', 'bakery', 'patisserie', 'pastry', 'pastries', 'cake', 'cupcake', 'donut', 'doughnut', 'candy', 'chocolate', 'sweets', 'macaron', 'confectionery'] },
  { kind: 'food', keywords: ['restaurant', 'food', 'pizza', 'pizzeria', 'burger', 'sushi', 'ramen', 'taco', 'diner', 'grill', 'steakhouse', 'bbq', 'barbecue', 'seafood', 'italian', 'mexican', 'chinese', 'thai', 'indian', 'japanese', 'deli', 'sandwich', 'noodle', 'kitchen', 'eatery', 'bistro', 'buffet', 'fast_food', 'fast food', 'bagel'] },
  { kind: 'shopping', keywords: ['shop', 'store', 'mall', 'market', 'boutique', 'retail', 'supermarket', 'grocery', 'mart', 'outlet', 'bookstore'] },
  { kind: 'sights', keywords: ['museum', 'gallery', 'monument', 'landmark', 'attraction', 'historic', 'tourist', 'art', 'theater', 'theatre', 'cinema', 'movie', 'aquarium', 'zoo', 'church', 'temple', 'mosque', 'cathedral', 'palace', 'castle', 'plaza', 'square', 'stadium', 'arena'] },
  { kind: 'outdoors', keywords: ['park', 'beach', 'trail', 'garden', 'mountain', 'hike', 'nature', 'forest', 'lake', 'river', 'viewpoint', 'scenic', 'campground', 'harbor', 'marina', 'pier', 'swimming pool', 'pool'] },
  { kind: 'hotel', keywords: ['hotel', 'hostel', 'motel', 'lodging', 'resort', 'inn', 'guest house', 'bed and breakfast'] },
];

/** Map a raw place category to a taxonomy kind. */
export function categorizeLayer(category?: string): string {
  const c = (category ?? '').toLowerCase().trim();
  if (!c) return 'other';
  for (const rule of RULES) {
    if (rule.keywords.some((k) => c.includes(k))) return rule.kind;
  }
  return 'other';
}

export function getTemplate(kind: string): LayerTemplate {
  return TEMPLATE_BY_KIND[kind] ?? TEMPLATE_BY_KIND.other;
}

/** Create a fresh layer from a taxonomy kind. */
export function makeLayerFromKind(kind: string): Layer {
  const t = getTemplate(kind);
  return { id: uid(), name: t.label, color: t.color, emoji: t.emoji, kind };
}

/** Create a blank custom layer (no auto-routing kind). */
export function makeCustomLayer(name: string): Layer {
  return {
    id: uid(),
    name: name.trim() || 'New Layer',
    color: LAYER_COLORS[Math.floor(Math.random() * LAYER_COLORS.length)],
    emoji: '📍',
  };
}

/**
 * Build layers for a set of places grouped by category kind, assigning each
 * place a layerId. Used for migrating pre-layers guides. `hiddenKinds` carries
 * over the old hidden-layer state (which was keyed by kind).
 */
export function assignLayers(
  places: Place[],
  hiddenKinds: string[] = []
): { layers: Layer[]; places: Place[] } {
  const order = LAYER_TEMPLATES.map((t) => t.kind);
  const present = new Set(places.map((p) => categorizeLayer(p.category)));
  const layerByKind = new Map<string, Layer>();

  const layers = order
    .filter((k) => present.has(k))
    .map((kind) => {
      const layer = makeLayerFromKind(kind);
      if (hiddenKinds.includes(kind)) layer.hidden = true;
      layerByKind.set(kind, layer);
      return layer;
    });

  const newPlaces = places.map((p) => ({
    ...p,
    layerId: layerByKind.get(categorizeLayer(p.category))?.id,
  }));

  return { layers, places: newPlaces };
}

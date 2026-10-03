import { uid } from '@/lib/id';
import type { Layer, Place } from '@/lib/types';

export type LayerTemplate = {
  kind: string;
  label: string;
  /** SF Symbol name — layers use Apple's native symbols, never emoji. */
  icon: string;
  color: string;
};

/** Default layer templates used to auto-create layers from a place category. */
export const LAYER_TEMPLATES: LayerTemplate[] = [
  { kind: 'food', label: 'Food', icon: 'fork.knife', color: '#FF3B30' },
  { kind: 'dessert', label: 'Sweet Treats', icon: 'birthday.cake.fill', color: '#FF2D55' },
  { kind: 'cafe', label: 'Coffee Shops', icon: 'cup.and.saucer.fill', color: '#FF9500' },
  { kind: 'bar', label: 'Nightlife', icon: 'wineglass.fill', color: '#AF52DE' },
  { kind: 'shopping', label: 'Shopping', icon: 'bag.fill', color: '#007AFF' },
  { kind: 'sights', label: 'Sights', icon: 'building.columns.fill', color: '#5856D6' },
  { kind: 'outdoors', label: 'Outdoors', icon: 'tree.fill', color: '#34C759' },
  { kind: 'hotel', label: 'Stay', icon: 'bed.double.fill', color: '#00C7BE' },
  { kind: 'other', label: 'Other', icon: 'mappin', color: '#8E8E93' },
];

const TEMPLATE_BY_KIND: Record<string, LayerTemplate> = Object.fromEntries(
  LAYER_TEMPLATES.map((t) => [t.kind, t]),
);

/** Palette offered in the layer editor. */
export const LAYER_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
];

/** SF Symbols offered in the layer editor — the only icons users can pick. */
export const LAYER_SYMBOLS = [
  'mappin',
  'fork.knife',
  'cup.and.saucer.fill',
  'wineglass.fill',
  'birthday.cake.fill',
  'bag.fill',
  'building.columns.fill',
  'tree.fill',
  'bed.double.fill',
  'paintpalette.fill',
  'music.note',
  'beach.umbrella.fill',
  'mountain.2.fill',
  'camera.fill',
  'ticket.fill',
  'book.fill',
  'star.fill',
  'heart.fill',
];

export const FALLBACK_SYMBOL = 'mappin';

// Legacy layers stored emojis; map the known ones to their symbol equivalent
// when old data is read (AsyncStorage migrate, server rows written pre-0014).
const EMOJI_TO_SYMBOL: Record<string, string> = {
  '📍': 'mappin',
  '🍽️': 'fork.knife',
  '🍰': 'birthday.cake.fill',
  '☕️': 'cup.and.saucer.fill',
  '🍸': 'wineglass.fill',
  '🛍️': 'bag.fill',
  '🏛️': 'building.columns.fill',
  '🌳': 'tree.fill',
  '🛏️': 'bed.double.fill',
  '🎨': 'paintpalette.fill',
  '🎵': 'music.note',
  '🏖️': 'beach.umbrella.fill',
  '⛰️': 'mountain.2.fill',
  '🌮': 'fork.knife',
  '🍜': 'fork.knife',
  '🍷': 'wineglass.fill',
  '📸': 'camera.fill',
  '⭐️': 'star.fill',
  '❤️': 'heart.fill',
};

/**
 * Coerce a stored icon value to an SF Symbol name: symbol names pass through,
 * known legacy emojis map to their equivalent, anything else falls back.
 */
export function normalizeLayerIcon(value: string | null | undefined): string {
  if (!value) return FALLBACK_SYMBOL;
  if (/^[a-z0-9.]+$/.test(value)) return value; // already a symbol name
  const stripped = value.replace(/️/g, ''); // emoji variation selectors
  return EMOJI_TO_SYMBOL[value] ?? EMOJI_TO_SYMBOL[stripped] ?? FALLBACK_SYMBOL;
}

// Transition shim: old clients still render layers.emoji, so writes from this
// build keep that column populated with the closest emoji. Dies with the
// emoji column once every client is on SF Symbols.
const SYMBOL_TO_EMOJI: Record<string, string> = {
  mappin: '📍',
  'fork.knife': '🍽️',
  'cup.and.saucer.fill': '☕️',
  'wineglass.fill': '🍸',
  'birthday.cake.fill': '🍰',
  'bag.fill': '🛍️',
  'building.columns.fill': '🏛️',
  'tree.fill': '🌳',
  'bed.double.fill': '🛏️',
  'paintpalette.fill': '🎨',
  'music.note': '🎵',
  'beach.umbrella.fill': '🏖️',
  'mountain.2.fill': '⛰️',
  'camera.fill': '📸',
  'ticket.fill': '🎟️',
  'book.fill': '📖',
  'star.fill': '⭐️',
  'heart.fill': '❤️',
};

/** The legacy emoji old clients should see for a symbol-iconed layer. */
export function legacyEmojiForIcon(icon: string): string {
  return SYMBOL_TO_EMOJI[icon] ?? '📍';
}

// Keyword rules, checked in order — first match wins. Café/bar precede food so
// "coffee shop" and "wine bar" don't fall into shopping/food.
const RULES: { kind: string; keywords: string[] }[] = [
  { kind: 'cafe', keywords: ['cafe', 'café', 'coffee', 'espresso', 'tea', 'matcha', 'juice'] },
  {
    kind: 'bar',
    keywords: [
      'bar',
      'pub',
      'club',
      'nightlife',
      'brewery',
      'beer',
      'wine',
      'cocktail',
      'lounge',
      'nightclub',
      'speakeasy',
    ],
  },
  {
    kind: 'dessert',
    keywords: [
      'dessert',
      'ice cream',
      'ice_cream',
      'creamery',
      'gelato',
      'frozen yogurt',
      'froyo',
      'bakery',
      'patisserie',
      'pastry',
      'pastries',
      'cake',
      'cupcake',
      'donut',
      'doughnut',
      'candy',
      'chocolate',
      'sweets',
      'macaron',
      'confectionery',
    ],
  },
  {
    kind: 'food',
    keywords: [
      'restaurant',
      'food',
      'pizza',
      'pizzeria',
      'burger',
      'sushi',
      'ramen',
      'taco',
      'diner',
      'grill',
      'steakhouse',
      'bbq',
      'barbecue',
      'seafood',
      'italian',
      'mexican',
      'chinese',
      'thai',
      'indian',
      'japanese',
      'deli',
      'sandwich',
      'noodle',
      'kitchen',
      'eatery',
      'bistro',
      'buffet',
      'fast_food',
      'fast food',
      'bagel',
    ],
  },
  {
    kind: 'shopping',
    keywords: [
      'shop',
      'store',
      'mall',
      'market',
      'boutique',
      'retail',
      'supermarket',
      'grocery',
      'mart',
      'outlet',
      'bookstore',
    ],
  },
  {
    kind: 'sights',
    keywords: [
      'museum',
      'gallery',
      'monument',
      'landmark',
      'attraction',
      'historic',
      'tourist',
      'art',
      'theater',
      'theatre',
      'cinema',
      'movie',
      'aquarium',
      'zoo',
      'church',
      'temple',
      'mosque',
      'cathedral',
      'palace',
      'castle',
      'plaza',
      'square',
      'stadium',
      'arena',
    ],
  },
  {
    kind: 'outdoors',
    keywords: [
      'park',
      'beach',
      'trail',
      'garden',
      'mountain',
      'hike',
      'nature',
      'forest',
      'lake',
      'river',
      'viewpoint',
      'scenic',
      'campground',
      'harbor',
      'marina',
      'pier',
      'swimming pool',
      'pool',
    ],
  },
  {
    kind: 'hotel',
    keywords: [
      'hotel',
      'hostel',
      'motel',
      'lodging',
      'resort',
      'inn',
      'guest house',
      'bed and breakfast',
    ],
  },
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
  return { id: uid(), name: t.label, color: t.color, icon: t.icon, kind };
}

/** Create a blank custom layer (no auto-routing kind). */
export function makeCustomLayer(name: string): Layer {
  return {
    id: uid(),
    name: name.trim() || 'New Layer',
    color: LAYER_COLORS[Math.floor(Math.random() * LAYER_COLORS.length)],
    icon: FALLBACK_SYMBOL,
  };
}

/**
 * Build layers for a set of places grouped by category kind, assigning each
 * place a layerId. Used for migrating pre-layers guides. `hiddenKinds` carries
 * over the old hidden-layer state (which was keyed by kind).
 */
export function assignLayers(
  places: Place[],
  hiddenKinds: string[] = [],
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

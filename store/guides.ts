import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uid } from '@/lib/id';
import {
  assignLayers,
  categorizeLayer,
  makeCustomLayer,
  makeLayerFromKind,
} from '@/lib/layers';
import type { Guide, Layer, Place } from '@/lib/types';
import { GUIDE_COLORS, GUIDE_EMOJIS } from '@/theme/tokens';

type LayerPatch = Partial<Pick<Layer, 'name' | 'color' | 'emoji'>>;

type GuidesState = {
  guides: Guide[];
  hydrated: boolean;
  createGuide: (name: string, emoji?: string, color?: string) => Guide;
  renameGuide: (id: string, name: string) => void;
  updateGuideStyle: (id: string, emoji: string, color: string) => void;
  updateGuide: (id: string, patch: { name?: string; emoji?: string; color?: string }) => void;
  deleteGuide: (id: string) => void;
  togglePinGuide: (id: string) => void;
  setGuidesOrder: (orderedIds: string[]) => void;
  addPlaceToGuide: (guideId: string, place: Omit<Place, 'id' | 'addedAt'>) => void;
  removePlaceFromGuide: (guideId: string, placeId: string) => void;
  movePlaceToLayer: (guideId: string, placeId: string, layerId: string) => void;
  addLayer: (guideId: string, name: string) => Layer | undefined;
  updateLayer: (guideId: string, layerId: string, patch: LayerPatch) => void;
  deleteLayer: (guideId: string, layerId: string) => void;
  reorderLayer: (guideId: string, layerId: string, direction: 'up' | 'down') => void;
  moveLayerIndex: (guideId: string, from: number, to: number) => void;
  toggleLayerHidden: (guideId: string, layerId: string) => void;
  toggleLayerCollapsed: (guideId: string, layerId: string) => void;
  setAllLayersHidden: (guideId: string, hidden: boolean) => void;
  setAllLayersCollapsed: (guideId: string, collapsed: boolean) => void;
  getGuide: (id: string) => Guide | undefined;
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Update one guide by id via an updater fn. */
function mapGuide(guides: Guide[], id: string, fn: (g: Guide) => Guide): Guide[] {
  return guides.map((g) => (g.id === id ? fn(g) : g));
}

/** Update one layer within a guide. */
function mapLayer(guide: Guide, layerId: string, fn: (l: Layer) => Layer): Guide {
  return { ...guide, layers: (guide.layers ?? []).map((l) => (l.id === layerId ? fn(l) : l)) };
}

export const useGuides = create<GuidesState>()(
  persist(
    (set, get) => ({
      guides: [],
      hydrated: false,

      createGuide: (name, emoji, color) => {
        const seed = get().guides.length;
        const guide: Guide = {
          id: uid(),
          name: name.trim() || 'Untitled Guide',
          emoji: emoji ?? pick(GUIDE_EMOJIS, seed),
          color: color ?? pick(GUIDE_COLORS, seed),
          places: [],
          createdAt: Date.now(),
          layers: [],
        };
        set((s) => ({ guides: [guide, ...s.guides] }));
        return guide;
      },

      renameGuide: (id, name) =>
        set((s) => ({
          guides: mapGuide(s.guides, id, (g) => ({ ...g, name: name.trim() || g.name })),
        })),

      togglePinGuide: (id) =>
        set((s) => ({ guides: mapGuide(s.guides, id, (g) => ({ ...g, pinned: !g.pinned })) })),

      setGuidesOrder: (orderedIds) =>
        set((s) => {
          const byId = new Map(s.guides.map((g) => [g.id, g]));
          const next: Guide[] = [];
          for (const id of orderedIds) {
            const g = byId.get(id);
            if (g) next.push(g);
          }
          // Safety: keep any guide missing from the id list.
          for (const g of s.guides) if (!orderedIds.includes(g.id)) next.push(g);
          return { guides: next };
        }),


      updateGuideStyle: (id, emoji, color) =>
        set((s) => ({ guides: mapGuide(s.guides, id, (g) => ({ ...g, emoji, color })) })),

      updateGuide: (id, patch) =>
        set((s) => ({
          guides: mapGuide(s.guides, id, (g) => ({
            ...g,
            name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
            emoji: patch.emoji ?? g.emoji,
            color: patch.color ?? g.color,
          })),
        })),

      deleteGuide: (id) =>
        set((s) => ({ guides: s.guides.filter((g) => g.id !== id) })),

      addPlaceToGuide: (guideId, place) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => {
            // Avoid duplicate pins at the same coordinates.
            const exists = g.places.some(
              (p) =>
                Math.abs(p.latitude - place.latitude) < 1e-6 &&
                Math.abs(p.longitude - place.longitude) < 1e-6
            );
            if (exists) return g;

            // Auto-route into a layer matching the category kind, creating it if
            // none exists yet.
            const kind = categorizeLayer(place.category);
            let layers = g.layers ?? [];
            let layer = layers.find((l) => l.kind === kind);
            if (!layer) {
              layer = makeLayerFromKind(kind);
              layers = [...layers, layer];
            }
            const newPlace: Place = {
              ...place,
              id: uid(),
              addedAt: Date.now(),
              layerId: layer.id,
            };
            return { ...g, layers, places: [...g.places, newPlace] };
          }),
        })),

      removePlaceFromGuide: (guideId, placeId) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => ({
            ...g,
            places: g.places.filter((p) => p.id !== placeId),
          })),
        })),

      movePlaceToLayer: (guideId, placeId, layerId) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => ({
            ...g,
            places: g.places.map((p) => (p.id === placeId ? { ...p, layerId } : p)),
          })),
        })),

      addLayer: (guideId, name) => {
        const layer = makeCustomLayer(name);
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => ({
            ...g,
            layers: [...(g.layers ?? []), layer],
          })),
        }));
        return layer;
      },

      updateLayer: (guideId, layerId, patch) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) =>
            mapLayer(g, layerId, (l) => ({
              ...l,
              ...patch,
              name: patch.name !== undefined ? patch.name.trim() || l.name : l.name,
            }))
          ),
        })),

      deleteLayer: (guideId, layerId) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => {
            let remaining = (g.layers ?? []).filter((l) => l.id !== layerId);
            const orphans = g.places.filter((p) => p.layerId === layerId);
            let fallback = remaining[0];
            // If we deleted the last layer but places remain, keep an "Other".
            if (orphans.length > 0 && !fallback) {
              fallback = makeLayerFromKind('other');
              remaining = [fallback];
            }
            const places = g.places.map((p) =>
              p.layerId === layerId ? { ...p, layerId: fallback?.id } : p
            );
            return { ...g, layers: remaining, places };
          }),
        })),

      reorderLayer: (guideId, layerId, direction) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => {
            const layers = [...(g.layers ?? [])];
            const i = layers.findIndex((l) => l.id === layerId);
            const j = direction === 'up' ? i - 1 : i + 1;
            if (i < 0 || j < 0 || j >= layers.length) return g;
            [layers[i], layers[j]] = [layers[j], layers[i]];
            return { ...g, layers };
          }),
        })),

      moveLayerIndex: (guideId, from, to) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => {
            const layers = [...(g.layers ?? [])];
            if (from < 0 || from >= layers.length || to < 0 || to >= layers.length) return g;
            const [moved] = layers.splice(from, 1);
            layers.splice(to, 0, moved);
            return { ...g, layers };
          }),
        })),

      toggleLayerHidden: (guideId, layerId) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) =>
            mapLayer(g, layerId, (l) => ({ ...l, hidden: !l.hidden }))
          ),
        })),

      toggleLayerCollapsed: (guideId, layerId) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) =>
            mapLayer(g, layerId, (l) => ({ ...l, collapsed: !l.collapsed }))
          ),
        })),

      setAllLayersHidden: (guideId, hidden) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => ({
            ...g,
            layers: (g.layers ?? []).map((l) => ({ ...l, hidden })),
          })),
        })),

      setAllLayersCollapsed: (guideId, collapsed) =>
        set((s) => ({
          guides: mapGuide(s.guides, guideId, (g) => ({
            ...g,
            layers: (g.layers ?? []).map((l) => ({ ...l, collapsed })),
          })),
        })),

      getGuide: (id) => get().guides.find((g) => g.id === id),
    }),
    {
      name: 'guide-maker-storage-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // Migrate pre-layers guides: build layers from category grouping and
      // assign each place a layerId; carry over old hidden-layer state.
      migrate: (persisted: any, version: number) => {
        if (persisted && version < 2) {
          persisted.guides = (persisted.guides ?? []).map((g: any) => {
            if (g.layers) return g;
            const { layers, places } = assignLayers(g.places ?? [], g.hiddenLayers ?? []);
            const { hiddenLayers, ...rest } = g;
            return { ...rest, layers, places };
          });
        }
        return persisted;
      },
      partialize: (s) => ({ guides: s.guides }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

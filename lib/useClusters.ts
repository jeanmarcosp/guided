import { useCallback, useMemo } from 'react';
import type { Region } from 'react-native-maps';
import Supercluster from 'supercluster';
import type { Place } from '@/lib/types';

/** A count bubble standing in for 2+ places at the current zoom. */
export type ClusterPoint = {
  type: 'cluster';
  /** Unique per generation; point count included so a reused id remounts cleanly. */
  key: string;
  clusterId: number;
  coordinate: { latitude: number; longitude: number };
  pointCount: number;
  /** Most common layerId among members ('' when layerless) — drives bubble tint. */
  dominantLayerId: string;
};

/** A place far enough from its neighbors to render as a regular pin. */
export type SinglePoint = { type: 'place'; key: string; place: Place };

export type MapPoint = ClusterPoint | SinglePoint;

type PlaceProps = { place: Place };

/**
 * Where a pooled marker sits while not part of the current cluster view.
 * Markers are never unmounted on zoom changes — react-native-maps'
 * legacy-interop layer throws NSRangeException when map children are
 * inserted/removed after mount on the New Architecture — so hidden markers
 * park out of sight instead.
 *
 * Every marker gets its OWN spot on a 5° grid over the Southern Ocean. Never
 * park two markers on the same coordinate: iOS's marker-collision engine
 * suppresses overlapping pins and only re-evaluates on a region change, so a
 * pin unparked from a shared pile stays invisible until the map is nudged.
 */
export function parkedCoordinate(slot: number) {
  return {
    latitude: -85 + 5 * Math.floor(slot / 72),
    longitude: -177.5 + 5 * (slot % 72),
  };
}

// radius 50px merges at neighborhood scale; maxZoom 16 means everything is an
// individual pin by street level; minPoints 2 keeps lone pins un-bubbled.
const CLUSTER_OPTIONS = { radius: 50, maxZoom: 16, minPoints: 2 } as const;

// Cluster for the whole world, not the viewport: every place stays rendered
// during camera flights (matching the pre-clustering behavior), output depends
// only on the integer zoom so pans recompute nothing, and no bbox math can
// ever hand supercluster an invalid box.
const WORLD_BBOX: [number, number, number, number] = [-180, -90, 180, 90];

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function isValidRegion(region: Region): boolean {
  return (
    isValidCoordinate(region.latitude, region.longitude) &&
    Number.isFinite(region.latitudeDelta) &&
    Number.isFinite(region.longitudeDelta) &&
    region.latitudeDelta > 0 &&
    region.longitudeDelta > 0
  );
}

/** Slippy-map zoom for a region, clamped to an integer supercluster accepts. */
export function regionToZoom(region: Region): number {
  const raw = Math.log2(360 / region.longitudeDelta);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(0, Math.min(20, Math.floor(raw)));
}

function dominantLayerId(leaves: Supercluster.PointFeature<PlaceProps>[]): string {
  const counts = new Map<string, number>();
  let best = '';
  let bestCount = 0;
  for (const leaf of leaves) {
    const layerId = leaf.properties.place.layerId ?? '';
    const count = (counts.get(layerId) ?? 0) + 1;
    counts.set(layerId, count);
    if (count > bestCount) {
      bestCount = count;
      best = layerId;
    }
  }
  return best;
}

/**
 * Groups places into Apple Maps–style clusters for the current region's zoom.
 * Places with malformed coordinates are dropped before indexing — supercluster
 * hard-crashes on non-finite input.
 */
export function useClusters(
  places: Place[],
  region: Region,
): {
  points: MapPoint[];
  /** Members of a cluster, for fitToCoordinates. Null if the id went stale (index rebuilt). */
  getClusterLeaves: (cluster: ClusterPoint) => Place[] | null;
} {
  const validPlaces = useMemo(() => {
    const valid = places.filter((p) => isValidCoordinate(p.latitude, p.longitude));
    if (__DEV__ && valid.length !== places.length) {
      const dropped = places.filter((p) => !valid.includes(p));
      console.warn(
        `useClusters: dropped ${dropped.length} place(s) with invalid coordinates:`,
        dropped.map((p) => p.id).join(', '),
      );
    }
    return valid;
  }, [places]);

  const index = useMemo(() => {
    const idx = new Supercluster<PlaceProps>(CLUSTER_OPTIONS);
    idx.load(
      validPlaces.map((place) => ({
        type: 'Feature' as const,
        // GeoJSON is [longitude, latitude] — reversed from react-native-maps.
        geometry: { type: 'Point' as const, coordinates: [place.longitude, place.latitude] },
        properties: { place },
      })),
    );
    return idx;
  }, [validPlaces]);

  // Deltas that stay within one integer zoom step recompute nothing.
  const zoom = regionToZoom(region);

  const points = useMemo<MapPoint[]>(() => {
    return index.getClusters(WORLD_BBOX, zoom).map((feature): MapPoint => {
      const props = feature.properties;
      if ('cluster' in props && props.cluster) {
        const [longitude, latitude] = feature.geometry.coordinates;
        return {
          type: 'cluster',
          key: `cluster-${props.cluster_id}-${props.point_count}`,
          clusterId: props.cluster_id,
          coordinate: { latitude, longitude },
          pointCount: props.point_count,
          dominantLayerId: dominantLayerId(index.getLeaves(props.cluster_id, Infinity)),
        };
      }
      const { place } = props as PlaceProps;
      return { type: 'place', key: place.id, place };
    });
  }, [index, zoom]);

  const getClusterLeaves = useCallback(
    (cluster: ClusterPoint): Place[] | null => {
      try {
        return index.getLeaves(cluster.clusterId, Infinity).map((leaf) => leaf.properties.place);
      } catch {
        return null; // Stale id from a previous index generation.
      }
    },
    [index],
  );

  return { points, getClusterLeaves };
}

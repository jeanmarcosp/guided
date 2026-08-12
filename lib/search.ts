import { isFoursquareAvailable, searchFoursquare } from '@/lib/foursquare';
import { isAppleSearchAvailable, searchApple } from '@/modules/apple-search';
import type { Place } from '@/lib/types';

export type SearchResult = Omit<Place, 'id' | 'addedAt'>;

const PHOTON_URL = 'https://photon.komoot.io/api/';

type PhotonFeature = {
  geometry: { coordinates: [number, number] }; // [lon, lat]
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
};

function buildAddress(p: PhotonFeature['properties']): string {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [line1, p.city, p.state, p.country].filter(Boolean);
  return parts.join(', ');
}

function prettyCategory(p: PhotonFeature['properties']): string | undefined {
  const raw = p.osm_value || p.osm_key;
  if (!raw) return undefined;
  return raw.replace(/_/g, ' ');
}

/**
 * Unified place search with graceful degradation:
 *   1. Apple MKLocalSearch — native iOS dev build (best; matches Apple Maps)
 *   2. Foursquare Places   — when EXPO_PUBLIC_FOURSQUARE_API_KEY is set
 *   3. Photon / OpenStreetMap — always-available keyless fallback
 */
export async function searchPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  if (isAppleSearchAvailable) {
    try {
      return await searchApple(q, near);
    } catch {
      // Fall through to the next provider.
    }
  }
  if (isFoursquareAvailable) {
    try {
      return await searchFoursquare(q, near, signal);
    } catch {
      // Fall through to OSM.
    }
  }
  return searchPhoton(q, near, signal);
}

/** Search places via Photon (OpenStreetMap) — free, no API key. */
async function searchPhoton(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Build the query string manually — React Native's URLSearchParams is
  // unreliable (its toString() does not encode correctly on Hermes).
  const parts = [`q=${encodeURIComponent(q)}`, 'limit=12'];
  if (near) {
    parts.push(`lat=${near.latitude}`, `lon=${near.longitude}`);
  }

  const res = await fetch(`${PHOTON_URL}?${parts.join('&')}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);

  const data = (await res.json()) as { features?: PhotonFeature[] };
  const features = data.features ?? [];

  return features
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const name =
        f.properties.name ||
        f.properties.street ||
        f.properties.city ||
        'Unnamed place';
      return {
        name,
        address: buildAddress(f.properties) || undefined,
        latitude: lat,
        longitude: lon,
        category: prettyCategory(f.properties),
      } satisfies SearchResult;
    });
}

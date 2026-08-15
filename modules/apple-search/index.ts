import { requireOptionalNativeModule } from 'expo-modules-core';
import type { SearchResult } from '@/lib/search';

// requireOptionalNativeModule returns null when the native module isn't linked
// (e.g. running in Expo Go), so the app can gracefully fall back to OSM search.
const AppleSearch = requireOptionalNativeModule('AppleSearch');

export const isAppleSearchAvailable = AppleSearch != null;

type RawResult = {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  category?: string;
};

/** "MKPOICategoryRestaurant" -> "restaurant" */
function prettifyCategory(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/^MKPOICategory/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return cleaned || undefined;
}

/** Search Apple's place database (same data as Apple Maps). */
export async function searchApple(
  query: string,
  near?: { latitude: number; longitude: number },
): Promise<SearchResult[]> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  const raw: RawResult[] = await AppleSearch.search(
    query,
    near?.latitude ?? null,
    near?.longitude ?? null,
  );
  return raw.map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    category: prettifyCategory(r.category),
  }));
}

/**
 * Open the real Apple POI (place card with photos/reviews) in Apple Maps,
 * resolved by name near the given coordinate.
 */
export async function openInMaps(
  query: string,
  near: { latitude: number; longitude: number },
): Promise<boolean> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  return AppleSearch.openInMaps(query, near.latitude, near.longitude);
}

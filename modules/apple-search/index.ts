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

/** A type-ahead suggestion from MKLocalSearchCompleter — no coordinates yet. */
export type AppleCompletion = {
  /** Index into the native module's latest completion set (for resolving). */
  index: number;
  title: string;
  subtitle: string;
  /** UTF-16 ranges of `title` matching the typed fragment — for bolding. */
  titleRanges: { location: number; length: number }[];
};

/**
 * Live suggestions for a partially typed query — the same engine behind
 * Apple Maps' own search field. Much cheaper than a full search; the native
 * completer self-throttles and supersedes stale fragments.
 */
export async function getAppleCompletions(
  fragment: string,
  near?: { latitude: number; longitude: number },
): Promise<AppleCompletion[]> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  return AppleSearch.getCompletions(fragment, near?.latitude ?? null, near?.longitude ?? null);
}

/**
 * Resolve a tapped completion to a concrete place (coordinates, address,
 * category). Falls back to a plain text search if the native completion list
 * changed under the tap.
 */
export async function resolveAppleCompletion(
  completion: AppleCompletion,
  near?: { latitude: number; longitude: number },
): Promise<SearchResult> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  try {
    const raw: RawResult = await AppleSearch.resolveCompletion(completion.index, completion.title);
    return {
      name: raw.name,
      latitude: raw.latitude,
      longitude: raw.longitude,
      address: raw.address,
      category: prettifyCategory(raw.category),
    };
  } catch {
    const results = await searchApple(completion.title, near);
    if (results.length === 0) throw new Error('No match for suggestion');
    return results[0];
  }
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

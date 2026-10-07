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
  /** Stable Apple Maps Place ID (MKMapItem.identifier, iOS 18+). */
  appleId?: string;
};

function rawToResult(r: RawResult): SearchResult {
  return {
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    category: prettifyCategory(r.category),
    applePlaceId: r.appleId,
  };
}

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
  return raw.map(rawToResult);
}

/**
 * Batch-resolve stable Apple Place IDs ("I" + hex) to full places. Skips ids
 * that no longer resolve. iOS 18+ — rejects with UNSUPPORTED below that.
 */
export async function lookupApplePlaces(ids: string[]): Promise<SearchResult[]> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  const raw: RawResult[] = await AppleSearch.lookupPlaces(ids);
  return raw.map(rawToResult);
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
    return rawToResult(raw);
  } catch {
    const results = await searchApple(completion.title, near);
    if (results.length === 0) throw new Error('No match for suggestion');
    return results[0];
  }
}

/**
 * Open the real Apple POI (place card with photos/reviews) in the Apple Maps
 * app. A stored Place ID resolves the exact POI; otherwise the closest name
 * match near the coordinate. Resolves with the opened item's Place ID.
 */
export async function openInMaps(
  query: string,
  near: { latitude: number; longitude: number },
  applePlaceId?: string,
): Promise<string | null> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  return AppleSearch.openInMaps(query, near.latitude, near.longitude, applePlaceId ?? null);
}

/**
 * Show the full native Apple Maps place card inside the app
 * (MKMapItemDetailViewController, iOS 18+; earlier iOS opens the Maps app).
 * Resolves with the shown item's Place ID.
 */
export async function showPlaceCard(
  query: string,
  near: { latitude: number; longitude: number },
  applePlaceId?: string,
): Promise<string | null> {
  if (!AppleSearch) throw new Error('AppleSearch native module is unavailable');
  return AppleSearch.showPlaceCard(query, near.latitude, near.longitude, applePlaceId ?? null);
}

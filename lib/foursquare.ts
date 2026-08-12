import type { SearchResult } from '@/lib/search';

const FSQ_URL = 'https://places-api.foursquare.com/places/search';
const API_VERSION = '2025-06-17';

// EXPO_PUBLIC_ vars are inlined into the JS bundle at build time. Fine for a
// personal app; for a public release, proxy Foursquare through a small backend.
export const FOURSQUARE_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';

export const isFoursquareAvailable = FOURSQUARE_KEY.length > 0;

type FsqPlace = {
  fsq_place_id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  categories?: { name: string }[];
  location?: {
    formatted_address?: string;
    locality?: string;
    region?: string;
  };
};

function formatAddress(loc?: FsqPlace['location']): string | undefined {
  if (!loc) return undefined;
  if (loc.formatted_address) return loc.formatted_address;
  const parts = [loc.locality, loc.region].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/** Search Foursquare Places — strong coverage of independent businesses. */
export async function searchFoursquare(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const parts = [`query=${encodeURIComponent(query)}`, 'limit=20', 'sort=RELEVANCE'];
  if (near) {
    parts.push(`ll=${near.latitude},${near.longitude}`, 'radius=100000');
  }

  const res = await fetch(`${FSQ_URL}?${parts.join('&')}`, {
    signal,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${FOURSQUARE_KEY}`,
      'X-Places-Api-Version': API_VERSION,
    },
  });
  if (!res.ok) throw new Error(`Foursquare error (${res.status})`);

  const data = (await res.json()) as { results?: FsqPlace[] };
  return (data.results ?? [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: r.name,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      address: formatAddress(r.location),
      category: r.categories?.[0]?.name?.toLowerCase(),
    }));
}

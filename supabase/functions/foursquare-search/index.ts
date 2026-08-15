// Foursquare Places proxy — keeps FOURSQUARE_API_KEY off the client bundle.
// Deployed with verify_jwt = true, so only authenticated users can call it.
// Request:  POST { query: string, near?: { latitude: number; longitude: number } }
// Response: SearchResult[]  (matches lib/search.ts: { name, latitude, longitude, address?, category? })

const FSQ_URL = 'https://places-api.foursquare.com/places/search';
const API_VERSION = '2025-06-17';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FsqPlace = {
  name: string;
  latitude?: number;
  longitude?: number;
  categories?: { name: string }[];
  location?: { formatted_address?: string; locality?: string; region?: string };
};

function formatAddress(loc?: FsqPlace['location']): string | undefined {
  if (!loc) return undefined;
  if (loc.formatted_address) return loc.formatted_address;
  const parts = [loc.locality, loc.region].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const key = Deno.env.get('FOURSQUARE_API_KEY');
  if (!key) return json({ error: 'foursquare_not_configured' }, 501);

  let query = '';
  let near: { latitude: number; longitude: number } | undefined;
  try {
    const body = await req.json();
    query = String(body.query ?? '').trim();
    if (body.near && typeof body.near.latitude === 'number') near = body.near;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (query.length < 2) return json([]);

  const parts = [`query=${encodeURIComponent(query)}`, 'limit=20', 'sort=RELEVANCE'];
  if (near) parts.push(`ll=${near.latitude},${near.longitude}`, 'radius=100000');

  const res = await fetch(`${FSQ_URL}?${parts.join('&')}`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Places-Api-Version': API_VERSION,
    },
  });
  if (!res.ok) return json({ error: `foursquare_error_${res.status}` }, 502);

  const data = (await res.json()) as { results?: FsqPlace[] };
  const results = (data.results ?? [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: r.name,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      address: formatAddress(r.location),
      category: r.categories?.[0]?.name?.toLowerCase(),
    }));

  return json(results);
});

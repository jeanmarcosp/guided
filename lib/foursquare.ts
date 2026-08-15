import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { SearchResult } from '@/lib/search';

// Foursquare is now proxied through the `foursquare-search` Edge Function so the
// API key stays server-side. Available whenever the backend is configured; the
// function itself returns [] if FOURSQUARE_API_KEY is unset on the server.
export const isFoursquareAvailable = isSupabaseConfigured;

/** Search Foursquare Places via the backend proxy. */
export async function searchFoursquare(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.functions.invoke('foursquare-search', {
    body: { query, near },
  });
  if (error) throw error;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return (data ?? []) as SearchResult[];
}

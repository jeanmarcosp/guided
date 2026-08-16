import { supabase } from '@/lib/supabase';

// Personal "visited" marks (see supabase/migrations/0012_place_visits.sql).
// RLS scopes every row to the acting user, so these queries never need to (and
// must not) filter by user_id themselves beyond what the mark/unmark writes set.

/** All place ids the current user has marked visited (RLS-scoped to them). */
export async function fetchVisitedPlaceIds(): Promise<string[]> {
  const { data, error } = await supabase.from('place_visits').select('place_id');
  if (error) throw error;
  return ((data ?? []) as { place_id: string }[]).map((r) => r.place_id);
}

/**
 * Mark a place visited. A duplicate (already marked, e.g. from another device)
 * collides on the primary key (Postgres 23505); we swallow it as a no-op.
 */
export async function markVisitedRemote(placeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('place_visits')
    .insert({ user_id: userId, place_id: placeId });
  if (error && error.code !== '23505') throw error;
}

/** Remove a place's visited mark. RLS also confines the delete to the caller. */
export async function unmarkVisitedRemote(placeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('place_visits')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId);
  if (error) throw error;
}

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { layerRowToLayer, placeRowToPlace } from '@/lib/api/mappers';
import type { GuideRow, LayerRow, PlaceRow } from '@/lib/api/mappers';
import type { ShareRow } from '@/lib/api/shares';
import { supabase } from '@/lib/supabase';
import { applySuppressed, forgetSynced, noteSynced } from '@/lib/sync/guidesSync';
import type { Guide, Layer } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';

// Live collaboration: a single channel subscribes to row changes on
// guides/layers/places and applies each into the Zustand store per-row. This
// replaces the phase-1 focus-refresh polling. Row delivery is governed by RLS
// (the SELECT policies via can_read_guide), so we only ever receive changes for
// guides we own or have an accepted share on. Everything is applied under
// applySuppressed() so the write-through in guidesSync.ts doesn't echo it back,
// and noteSynced() keeps that engine's diff baseline in step with the server.
//
// Note on DELETE events: with the default replica identity, `payload.old` carries
// only the primary key, so we don't get guide_id on a child delete — we remove the
// row by its (globally unique) id wherever it lives in the store.

let channel: RealtimeChannel | null = null;
// Serializes startRealtime()/stopRealtime() against each other and against
// concurrent calls to themselves. Two hazards this closes:
//  1. Two overlapping startRealtime() calls (e.g. the auth store's initial
//     getSession() and its onAuthStateChange listener can each independently
//     flip status to 'signedIn', both triggering bootstrapSignedIn()) would
//     otherwise both pass the old `if (channel) return` guard — it was only
//     assigned after an await — and each build its own `.on()` listeners.
//  2. supabase.removeChannel() is itself async (it awaits a network
//     unsubscribe before detaching the channel from the client), so a
//     startRealtime() landing while a stopRealtime() is still tearing down
//     would have `supabase.channel('guides-sync')` hand back that same,
//     still-joined channel (the client reuses channels by topic name).
// Either way the symptom is the same: `.on()` throws "cannot add
// `postgres_changes` callbacks ... after `subscribe()`" because the channel
// object is already joined/joining when the second caller attaches to it.
let pending: Promise<void> | null = null;

/** Mutate one guide by id under suppression, and refresh its sync baseline. */
function patchGuide(guideId: string, fn: (g: Guide) => Guide): void {
  applySuppressed(() => {
    let updated: Guide | undefined;
    useGuides.setState((s) => ({
      guides: s.guides.map((g) => {
        if (g.id !== guideId) return g;
        updated = fn(g);
        return updated;
      }),
    }));
    if (updated) noteSynced(updated);
  });
}

function applyPlace(payload: RealtimePostgresChangesPayload<PlaceRow>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<PlaceRow>)?.id;
    if (!id) return;
    applySuppressed(() => {
      const touched: Guide[] = [];
      useGuides.setState((s) => ({
        guides: s.guides.map((g) => {
          if (!g.places.some((p) => p.id === id)) return g;
          const ng = { ...g, places: g.places.filter((p) => p.id !== id) };
          touched.push(ng);
          return ng;
        }),
      }));
      touched.forEach(noteSynced);
    });
    return;
  }

  const row = payload.new as PlaceRow;
  if (!row?.guide_id) return;
  // Ignore changes to a guide we don't have locally (a newly-shared guide arrives
  // through the accept-token flow / foreground refresh, with the correct role).
  if (!useGuides.getState().guides.some((g) => g.id === row.guide_id)) return;

  patchGuide(row.guide_id, (g) => {
    const place = placeRowToPlace(row);
    const places = [...g.places.filter((p) => p.id !== place.id), place].sort(
      (a, b) => a.addedAt - b.addedAt,
    );
    return { ...g, places };
  });
}

function applyLayer(payload: RealtimePostgresChangesPayload<LayerRow>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<LayerRow>)?.id;
    if (!id) return;
    applySuppressed(() => {
      const touched: Guide[] = [];
      useGuides.setState((s) => ({
        guides: s.guides.map((g) => {
          if (!(g.layers ?? []).some((l) => l.id === id)) return g;
          const ng = {
            ...g,
            layers: (g.layers ?? []).filter((l) => l.id !== id),
            // FK is ON DELETE SET NULL — the server also emits place updates, but
            // clear the orphaned layerId locally so the UI is consistent at once.
            places: g.places.map((p) => (p.layerId === id ? { ...p, layerId: undefined } : p)),
          };
          touched.push(ng);
          return ng;
        }),
      }));
      touched.forEach(noteSynced);
    });
    return;
  }

  const row = payload.new as LayerRow;
  if (!row?.guide_id) return;
  if (!useGuides.getState().guides.some((g) => g.id === row.guide_id)) return;

  patchGuide(row.guide_id, (g) => {
    const existing = (g.layers ?? []).find((l) => l.id === row.id);
    const mapped = layerRowToLayer(row);
    // layerRowToLayer resets hidden/collapsed (per-user view state) — keep ours.
    const layer: Layer = existing
      ? { ...mapped, hidden: existing.hidden, collapsed: existing.collapsed }
      : mapped;
    const others = (g.layers ?? []).filter((l) => l.id !== layer.id);
    const idx = Math.min(Math.max(row.sort_order ?? others.length, 0), others.length);
    others.splice(idx, 0, layer);
    return { ...g, layers: others };
  });
}

function applyGuide(payload: RealtimePostgresChangesPayload<GuideRow>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<GuideRow>)?.id;
    if (!id) return;
    applySuppressed(() => {
      useGuides.setState((s) => ({ guides: s.guides.filter((g) => g.id !== id) }));
      forgetSynced(id);
    });
    return;
  }

  const row = payload.new as GuideRow;
  if (!row?.id) return;

  if (useGuides.getState().guides.some((g) => g.id === row.id)) {
    // Metadata-only update (name/emoji/color/pinned); keep layers/places/role.
    patchGuide(row.id, (g) => ({
      ...g,
      name: row.name,
      emoji: row.emoji,
      color: row.color,
      pinned: row.pinned,
    }));
    return;
  }

  // A guide we own appearing from another device — add it (children arrive as
  // their own events). Shared guides are intentionally not added here.
  if (row.owner_id === useAuth.getState().user?.id) {
    applySuppressed(() => {
      const g: Guide = {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        color: row.color,
        pinned: row.pinned,
        createdAt: new Date(row.created_at).getTime(),
        ownerId: row.owner_id,
        role: 'owner',
        places: [],
        layers: [],
      };
      useGuides.setState((s) => ({ guides: [g, ...s.guides] }));
      noteSynced(g);
    });
  }
}

// Shape of a profiles row as delivered over Realtime (subset we render).
type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
};

// A collaborator changed their profile (avatar image/color, display name). Patch
// the derived member roster + "shared by" label on every guide they appear in,
// so home-card clusters and rosters update live. Our own profile row arrives too
// but is a no-op — we're never in our own members list, and our owned guides use
// role 'owner' (skipped below). Membership *additions* still land on the next
// foreground refresh (that's a guide_shares change + a profile lookup, not here).
function applyProfile(payload: RealtimePostgresChangesPayload<ProfileRow>): void {
  if (payload.eventType === 'DELETE') return; // profiles aren't deleted in-app
  const row = payload.new as Partial<ProfileRow>;
  if (!row?.id) return;
  const uid = row.id;
  const name = row.display_name?.trim() || row.email || undefined;
  const avatarUrl = row.avatar_url ?? null;
  const avatarColor = row.avatar_color ?? null;

  applySuppressed(() => {
    const touched: Guide[] = [];
    useGuides.setState((s) => ({
      guides: s.guides.map((g) => {
        let changed = false;
        const members = (g.members ?? []).map((m) => {
          if (m.userId !== uid) return m;
          changed = true;
          return { ...m, name: name ?? m.name, avatarUrl, avatarColor };
        });
        // For a guide shared with us, keep the owner's "shared by <name>" current.
        const ownerName = g.role !== 'owner' && g.ownerId === uid && name ? name : g.ownerName;
        if (!changed && ownerName === g.ownerName) return g;
        const ng: Guide = { ...g, members, ownerName };
        touched.push(ng);
        return ng;
      }),
    }));
    touched.forEach(noteSynced);
  });
}

function applyShare(payload: RealtimePostgresChangesPayload<ShareRow>): void {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;

  // A membership row was removed — if it's mine, I've lost access to the guide.
  // (Needs REPLICA IDENTITY FULL on guide_shares so the old row carries these
  // columns; see 0010_realtime.sql.)
  if (payload.eventType === 'DELETE') {
    const old = payload.old as Partial<ShareRow>;
    if (old.shared_with !== userId || !old.guide_id) return;
    const guideId = old.guide_id;
    applySuppressed(() => {
      useGuides.setState((s) => ({ guides: s.guides.filter((g) => g.id !== guideId) }));
      forgetSynced(guideId);
    });
    return;
  }

  // My own membership changed — apply the new role live so edit affordances and
  // the write-through gate (guidesSync `writable`) flip immediately. Rows for
  // other members (owner receives those too) don't affect our derived role.
  const row = payload.new as ShareRow;
  if (row.shared_with !== userId || row.status !== 'accepted') return;
  patchGuide(row.guide_id, (g) => ({ ...g, role: row.role }));
}

/** Subscribe to live guide/layer/place/share changes. Idempotent, and safe to
 * call concurrently with itself or with stopRealtime() — see the note on
 * `pending` above.
 *
 * The `if (pending) await ...` below must stay inline, not factored into an
 * `async function` helper that's awaited unconditionally: calling *any* async
 * function and awaiting its result defers by a microtask even when it has
 * nothing to wait for, which reopens the exact race this is closing — two
 * calls landing close together could both see `pending` as null, both yield
 * on that unconditional await, and both resume and race to claim `pending`
 * themselves. Awaiting only inside the `if` keeps the no-op path fully
 * synchronous, so whichever call runs first claims `pending` atomically
 * before the other one's check can run. */
export async function startRealtime(): Promise<void> {
  if (pending) await pending.catch(() => {});
  if (channel) return;
  pending = (async () => {
    // Authenticate the socket so postgres_changes are filtered by RLS for this user.
    const { data } = await supabase.auth.getSession();
    supabase.realtime.setAuth(data.session?.access_token ?? null);
    // Re-check after the await: a concurrent call may have already started it
    // (or we may have signed out again) while we were waiting on the session.
    if (channel || useAuth.getState().status !== 'signedIn') return;

    channel = supabase
      .channel('guides-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places' }, applyPlace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'layers' }, applyLayer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guides' }, applyGuide)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guide_shares' }, applyShare)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, applyProfile)
      .subscribe();
  })();
  try {
    await pending;
  } finally {
    pending = null;
  }
}

/** Tear down the live subscription (call on sign-out). Safe to call
 * concurrently with itself or with startRealtime(). */
export async function stopRealtime(): Promise<void> {
  if (pending) await pending.catch(() => {});
  if (!channel) return;
  const toRemove = channel;
  channel = null;
  pending = supabase.removeChannel(toRemove).then(() => {});
  try {
    await pending;
  } finally {
    pending = null;
  }
}

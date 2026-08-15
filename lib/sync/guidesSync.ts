import { deleteGuideRemote, fetchGuides, pushGuide, reorderGuidesRemote } from '@/lib/api/guides';
import type { Guide } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';

// Debounced write-through: the Zustand store stays the source of truth for the
// UI; this engine mirrors owner-editable guides to Supabase whenever they change.
// Reference equality works because every store mutator returns fresh objects only
// for the guide it touched.

const PUSH_DEBOUNCE_MS = 600;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;
let suppress = false; // set while we write server data INTO the store

/** A guide we're allowed to write back (owner or a not-yet-synced local guide). */
function pushable(g: Guide): boolean {
  return g.role !== 'viewer' && g.role !== 'editor';
}

function schedulePush(guide: Guide) {
  clearTimeout(pushTimers.get(guide.id));
  pushTimers.set(
    guide.id,
    setTimeout(async () => {
      pushTimers.delete(guide.id);
      const userId = useAuth.getState().user?.id;
      if (!userId) {
        console.warn('[sync] skipping push — no signed-in user');
        return;
      }
      try {
        await pushGuide(guide, userId);
      } catch (e: any) {
        console.warn('[sync] pushGuide failed:', e?.message ?? e, e?.code ?? '', e?.details ?? '');
      }
    }, PUSH_DEBOUNCE_MS)
  );
}

/**
 * Carry the current user's per-layer view state (hide/collapse) from the local
 * copy onto a freshly-fetched server guide. These are per-user UI prefs that are
 * never synced (see mappers/pushGuide), so they must survive a server refresh.
 */
function withLocalLayerView(server: Guide, local: Guide | undefined): Guide {
  const localLayers = local?.layers;
  if (!localLayers?.length || !server.layers?.length) return server;
  const viewById = new Map(localLayers.map((l) => [l.id, l]));
  return {
    ...server,
    layers: server.layers.map((l) => {
      const prev = viewById.get(l.id);
      return prev ? { ...l, hidden: prev.hidden, collapsed: prev.collapsed } : l;
    }),
  };
}

/** Replace local guides with the server's copy without triggering write-back. */
export async function hydrateGuidesFromServer(): Promise<void> {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;
  const guides = await fetchGuides(userId);
  suppress = true;
  try {
    const prevById = new Map(useGuides.getState().guides.map((g) => [g.id, g]));
    useGuides.setState({ guides: guides.map((g) => withLocalLayerView(g, prevById.get(g.id))) });
  } finally {
    suppress = false;
  }
}

/**
 * Pull the latest server state and merge in guides shared with us (viewer/editor)
 * without disturbing locally-owned guides — write-through keeps those as the
 * source of truth, so we never clobber the owner's in-progress edits. Adds guides
 * newly shared with us and drops any we've lost access to. This is the phase-1
 * stand-in for realtime updates on shared guides (owner edits → viewer sees them).
 */
export async function refreshSharedGuides(): Promise<void> {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;
  const server = await fetchGuides(userId);
  const serverById = new Map(server.map((g) => [g.id, g]));
  suppress = true;
  try {
    useGuides.setState((state) => {
      const localIds = new Set(state.guides.map((g) => g.id));
      const merged: Guide[] = [];
      for (const g of state.guides) {
        if (pushable(g)) merged.push(g); // owned: local stays authoritative
        // shared: refresh from server, but keep our own hide/collapse view state.
        else if (serverById.has(g.id)) merged.push(withLocalLayerView(serverById.get(g.id)!, g));
        // else: a shared guide we can no longer see — drop it.
      }
      // Append guides newly shared with us since the last load.
      for (const g of server) {
        if (!pushable(g) && !localIds.has(g.id)) merged.push(g);
      }
      return { guides: merged };
    });
  } finally {
    suppress = false;
  }
}

/** Clear all local guide state (call on sign-out to avoid cross-account leakage). */
export function clearLocalGuides(): void {
  suppress = true;
  try {
    useGuides.setState({ guides: [] });
  } finally {
    suppress = false;
  }
}

/** Run server-side edits (e.g. migration) without echoing them back as writes. */
export async function runSuppressed(fn: () => void | Promise<void>): Promise<void> {
  suppress = true;
  try {
    await fn();
  } finally {
    suppress = false;
  }
}

export function startGuidesSync(): () => void {
  if (started) return () => {};
  started = true;

  const unsub = useGuides.subscribe((state, prev) => {
    if (suppress) return;
    const current = state.guides;
    const previous = prev.guides;
    const currentIds = new Set(current.map((g) => g.id));

    // Deletes: previously-present, now gone, and we owned it.
    for (const p of previous) {
      if (!currentIds.has(p.id) && pushable(p)) {
        deleteGuideRemote(p.id).catch((e) => console.warn('[sync] delete failed', p.id, e));
      }
    }

    // Upserts: new or reference-changed pushable guides.
    const prevById = new Map(previous.map((g) => [g.id, g]));
    for (const g of current) {
      if (pushable(g) && prevById.get(g.id) !== g) schedulePush(g);
    }

    // Reordering: compare the owned-guide id sequence.
    const order = current.filter(pushable).map((g) => g.id);
    const prevOrder = previous.filter(pushable).map((g) => g.id);
    if (order.length === prevOrder.length && order.join(',') !== prevOrder.join(',')) {
      reorderGuidesRemote(order).catch((e) => console.warn('[sync] reorder failed', e));
    }
  });

  return () => {
    unsub();
    started = false;
  };
}

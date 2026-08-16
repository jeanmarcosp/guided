import {
  deleteGuideRemote,
  deleteLayerRemote,
  deletePlaceRemote,
  fetchGuides,
  insertPlaceRemote,
  reorderGuidesRemote,
  updatePlaceRemote,
  upsertGuideMetaRemote,
  upsertLayerRemote,
} from '@/lib/api/guides';
import type { Guide, Layer } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';

// Debounced, granular write-through: the Zustand store stays the source of truth
// for the UI; this engine mirrors each edit to Supabase as individual row writes.
// Phase 2 moved off whole-guide upserts (which ran delete-missing and could wipe a
// collaborator's concurrent change) to per-row writes, so multiple editors are safe.
//
// The diff baseline is `lastSynced` — a snapshot of each guide as last agreed with
// the server (set by every server-driven apply: hydrate/refresh/realtime). At flush
// time we diff the live guide against its snapshot and emit only the changed rows.
// Reference equality drives the diff: every store mutator returns fresh objects only
// for the guide (and child rows) it touched.

const PUSH_DEBOUNCE_MS = 600;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastSynced = new Map<string, Guide>();
const inFlight = new Set<string>(); // guides with a flush awaiting the network
let started = false;
let suppress = false; // set while we write server data INTO the store

/** A guide whose edits we push to the server (owner, editor, or unsynced local). */
function writable(g: Guide): boolean {
  return g.role !== 'viewer';
}

/** A guide we own: gates guide-level metadata, list order, and delete. */
function ownable(g: Guide): boolean {
  return g.role === 'owner' || g.role === undefined;
}

/** True while a guide has edits pending (debounced or mid-flush) — don't clobber it. */
function pending(id: string): boolean {
  return pushTimers.has(id) || inFlight.has(id);
}

/** Record a guide as the current agreed-with-server baseline for future diffs. */
export function noteSynced(guide: Guide): void {
  lastSynced.set(guide.id, guide);
}

/** Drop a guide's diff baseline (e.g. it was deleted server-side). */
export function forgetSynced(id: string): void {
  lastSynced.delete(id);
}

/** Apply server-driven store writes synchronously without echoing them as writes. */
export function applySuppressed(fn: () => void): void {
  suppress = true;
  try {
    fn();
  } finally {
    suppress = false;
  }
}

/** Compare only the *synced* layer fields — hidden/collapsed are per-user view state. */
function layerSyncEqual(a: Layer, b: Layer): boolean {
  return (
    a.name === b.name &&
    a.color === b.color &&
    a.emoji === b.emoji &&
    (a.kind ?? null) === (b.kind ?? null)
  );
}

/** Diff a guide against its last-synced snapshot and write only what changed. */
async function flushPush(guide: Guide, userId: string): Promise<void> {
  const prev = lastSynced.get(guide.id);
  inFlight.add(guide.id);
  try {
    // Guide metadata (owner-only; RLS blocks editors from the guides row anyway).
    if (ownable(guide)) {
      if (
        !prev ||
        prev.name !== guide.name ||
        prev.emoji !== guide.emoji ||
        prev.color !== guide.color ||
        (prev.pinned ?? false) !== (guide.pinned ?? false)
      ) {
        await upsertGuideMetaRemote(guide, userId);
      }
    }

    // Layers: upsert new/changed/reordered, delete removed. sort_order = array index.
    const curLayers = guide.layers ?? [];
    const prevLayers = prev?.layers ?? [];
    const prevLayerById = new Map(prevLayers.map((l, i) => [l.id, { layer: l, index: i }]));
    const curLayerIds = new Set(curLayers.map((l) => l.id));
    for (let i = 0; i < curLayers.length; i++) {
      const l = curLayers[i];
      const before = prevLayerById.get(l.id);
      if (!before || before.index !== i || !layerSyncEqual(before.layer, l)) {
        await upsertLayerRemote(l, guide.id, i);
      }
    }
    for (const l of prevLayers) {
      if (!curLayerIds.has(l.id)) await deleteLayerRemote(l.id);
    }

    // Places: ref inequality means a real content change (Place has no view-only
    // fields), so reference equality is a precise change signal here. New rows
    // (absent from the baseline) insert; existing rows update — see the note on
    // insertPlaceRemote for why these can't be a single upsert under RLS.
    const prevPlaceById = new Map((prev?.places ?? []).map((p) => [p.id, p]));
    const curPlaceIds = new Set(guide.places.map((p) => p.id));
    for (const pl of guide.places) {
      const before = prevPlaceById.get(pl.id);
      if (before === pl) continue;
      if (before) await updatePlaceRemote(pl);
      else await insertPlaceRemote(pl, guide.id, userId);
    }
    for (const id of prevPlaceById.keys()) {
      if (!curPlaceIds.has(id)) await deletePlaceRemote(id);
    }

    noteSynced(guide);
  } finally {
    inFlight.delete(guide.id);
  }
}

function schedulePush(guideId: string) {
  clearTimeout(pushTimers.get(guideId));
  pushTimers.set(
    guideId,
    setTimeout(() => {
      pushTimers.delete(guideId);
      const userId = useAuth.getState().user?.id;
      if (!userId) {
        console.warn('[sync] skipping push — no signed-in user');
        return;
      }
      // Re-read the latest store copy so coalesced edits all flush together.
      const guide = useGuides.getState().guides.find((g) => g.id === guideId);
      if (!guide || !writable(guide)) return;
      flushPush(guide, userId).catch((e: any) =>
        console.warn(
          '[sync] push failed:',
          guideId,
          e?.message ?? e,
          e?.code ?? '',
          e?.details ?? '',
        ),
      );
    }, PUSH_DEBOUNCE_MS),
  );
}

/**
 * Carry the current user's per-layer view state (hide/collapse) from the local
 * copy onto a freshly-fetched server guide. These are per-user UI prefs that are
 * never synced (see mappers/pushGuide), so they must survive a server refresh.
 */
export function withLocalLayerView(server: Guide, local: Guide | undefined): Guide {
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
    const prev = useGuides.getState().guides;
    const prevById = new Map(prev.map((g) => [g.id, g]));
    const localRank = new Map(prev.map((g, i) => [g.id, i]));
    // Preserve the user's local ordering. Owned-guide order also lives on the
    // server (sort_order), but shared guides' server sort_order belongs to the
    // owner, so the viewer's local reorder is the only source of truth for them.
    // Guides new to this device fall after known ones, keeping their server order.
    const base = prev.length;
    const next = guides
      .map((g, serverIdx) => ({ guide: withLocalLayerView(g, prevById.get(g.id)), serverIdx }))
      .sort((a, b) => {
        const ra = localRank.get(a.guide.id) ?? base + a.serverIdx;
        const rb = localRank.get(b.guide.id) ?? base + b.serverIdx;
        return ra - rb;
      })
      .map((x) => x.guide);
    useGuides.setState({ guides: next });
    lastSynced.clear();
    for (const g of next) noteSynced(g);
  } finally {
    suppress = false;
  }
}

/**
 * Reconciliation catch-up for guides shared with us (viewer/editor). Realtime is
 * the primary path for live updates now; this runs on app foreground to close any
 * gap from events missed while disconnected. Guides with pending local edits are
 * left untouched so we never clobber an in-progress write; quiescent editable
 * guides are refreshed from the server (also picks up owner multi-device edits).
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
        if (writable(g)) {
          if (pending(g.id)) {
            merged.push(g); // in-flight edits — keep local authoritative
          } else if (serverById.has(g.id)) {
            const m = withLocalLayerView(serverById.get(g.id)!, g);
            merged.push(m);
            noteSynced(m);
          } else if (g.role === undefined) {
            merged.push(g); // purely-local, not yet synced — keep
          } else {
            lastSynced.delete(g.id); // owned/editor guide gone from server — drop
          }
        } else if (serverById.has(g.id)) {
          const m = withLocalLayerView(serverById.get(g.id)!, g); // viewer: refresh
          merged.push(m);
          noteSynced(m);
        } else {
          lastSynced.delete(g.id); // viewer lost access — drop
        }
      }
      // Append guides newly shared with us since the last load.
      for (const g of server) {
        if (!writable(g) && !localIds.has(g.id)) {
          merged.push(g);
          noteSynced(g);
        }
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
    lastSynced.clear();
  } finally {
    suppress = false;
  }
}

/** Run server-side edits (e.g. migration, realtime apply) without echoing writes. */
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

    // Deletes: a guide we owned is gone — remove it (and its baseline) remotely.
    for (const p of previous) {
      if (!currentIds.has(p.id) && ownable(p)) {
        clearTimeout(pushTimers.get(p.id));
        pushTimers.delete(p.id);
        lastSynced.delete(p.id);
        deleteGuideRemote(p.id).catch((e) => console.warn('[sync] delete failed', p.id, e));
      }
    }

    // Upserts: new or reference-changed writable guides (owner + editor + local).
    const prevById = new Map(previous.map((g) => [g.id, g]));
    for (const g of current) {
      if (writable(g) && prevById.get(g.id) !== g) schedulePush(g.id);
    }

    // Reordering: compare the owned-guide id sequence (owner's own list only).
    const order = current.filter(ownable).map((g) => g.id);
    const prevOrder = previous.filter(ownable).map((g) => g.id);
    if (order.length === prevOrder.length && order.join(',') !== prevOrder.join(',')) {
      reorderGuidesRemote(order).catch((e) => console.warn('[sync] reorder failed', e));
    }
  });

  return () => {
    unsub();
    started = false;
  };
}

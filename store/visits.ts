import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { fetchVisitedPlaceIds, markVisitedRemote, unmarkVisitedRemote } from '@/lib/api/visits';
import { useAuth } from '@/store/auth';

// Personal "visited" marks, keyed by place id. This is per-user PRIVATE state:
// places are shared across collaborators, but each member marks (and sees) only
// their own visits. It lives here — a standalone store — rather than on the
// `Place` object on purpose: the guide sync engine (lib/sync/guidesSync.ts) diffs
// places by reference and would try to write a `visited` field to the SHARED
// `places` table, corrupting other members' data and failing RLS.
//
// Persisted to AsyncStorage for instant/offline reads on cold start, and backed
// by Supabase (place_visits) so marks sync across the user's devices. Toggles are
// optimistic and revert on failure, matching the app's write-through style.

type VisitsState = {
  /** placeId -> true for visited places. Absent keys are not visited. */
  visited: Record<string, boolean>;
  hydrated: boolean;
  isVisited: (placeId: string) => boolean;
  /** Flip a place's visited mark, optimistically, and persist to the server. */
  toggle: (placeId: string) => void;
  /** Replace the whole set from the server (on sign-in / foreground catch-up). */
  hydrate: () => Promise<void>;
  /** Drop all local marks (on sign-out) to avoid cross-account leakage. */
  clear: () => void;
};

export const useVisits = create<VisitsState>()(
  persist(
    (set, get) => ({
      visited: {},
      hydrated: false,

      isVisited: (placeId) => !!get().visited[placeId],

      toggle: (placeId) => {
        const userId = useAuth.getState().user?.id;
        const next = !get().visited[placeId];
        // Optimistic local update.
        set((s) => {
          const visited = { ...s.visited };
          if (next) visited[placeId] = true;
          else delete visited[placeId];
          return { visited };
        });
        if (!userId) return; // not signed in — keep the local mark only
        const write = next
          ? markVisitedRemote(placeId, userId)
          : unmarkVisitedRemote(placeId, userId);
        write.catch((e: any) => {
          console.warn('[visits] toggle failed:', placeId, e?.message ?? e);
          // Revert just this key on failure so local state stays truthful.
          set((s) => {
            const visited = { ...s.visited };
            if (next) delete visited[placeId];
            else visited[placeId] = true;
            return { visited };
          });
        });
      },

      hydrate: async () => {
        const userId = useAuth.getState().user?.id;
        if (!userId) return;
        try {
          const ids = await fetchVisitedPlaceIds();
          const visited: Record<string, boolean> = {};
          for (const id of ids) visited[id] = true;
          set({ visited, hydrated: true });
        } catch (e: any) {
          console.warn('[visits] hydrate failed:', e?.message ?? e);
        }
      },

      clear: () => set({ visited: {}, hydrated: false }),
    }),
    {
      name: 'guided-visits-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ visited: s.visited }),
    },
  ),
);

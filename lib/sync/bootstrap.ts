import { uploadLocalGuidesOnce } from '@/lib/migration/uploadLocalGuides';
import { clearLocalGuides, hydrateGuidesFromServer } from '@/lib/sync/guidesSync';
import { startRealtime, stopRealtime } from '@/lib/sync/realtime';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';
import { useVisits } from '@/store/visits';

/** Resolve once the persisted local guide store has finished rehydrating. */
function waitForLocalHydration(): Promise<void> {
  if (useGuides.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useGuides.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** After sign-in: migrate any legacy local guides, then load the cloud copy. */
export async function bootstrapSignedIn(): Promise<void> {
  const userId = useAuth.getState().user?.id;
  if (!userId) return;
  // Ensure locally-persisted guides are loaded before deciding what to migrate,
  // so a cold start doesn't mark migration done against an empty store.
  await waitForLocalHydration();
  await uploadLocalGuidesOnce(userId);
  await hydrateGuidesFromServer();
  // Load this user's personal "visited" marks (private, cross-device).
  await useVisits.getState().hydrate();
  // Go live: subscribe to collaborators' (and our other devices') edits.
  await startRealtime();
}

/** On sign-out: drop the live subscription and local guide + visit state. */
export function teardownSignedOut(): void {
  void stopRealtime();
  clearLocalGuides();
  useVisits.getState().clear();
}

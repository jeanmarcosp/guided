import { uploadLocalGuidesOnce } from '@/lib/migration/uploadLocalGuides';
import { clearLocalGuides, hydrateGuidesFromServer } from '@/lib/sync/guidesSync';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';

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
}

/** On sign-out: drop local guide state so the next account starts clean. */
export function teardownSignedOut(): void {
  clearLocalGuides();
}

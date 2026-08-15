import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushGuide } from '@/lib/api/guides';
import { uid } from '@/lib/id';
import type { Guide } from '@/lib/types';
import { useGuides } from '@/store/guides';

const MIGRATED_FLAG = 'guided-cloud-migrated-v1';

/** Re-key a local guide (legacy non-UUID ids) onto fresh UUIDs for the cloud. */
function rekeyForCloud(guide: Guide, userId: string): Guide {
  const layerIdMap = new Map<string, string>();
  const layers = (guide.layers ?? []).map((l) => {
    const newId = uid();
    layerIdMap.set(l.id, newId);
    return { ...l, id: newId };
  });
  const places = guide.places.map((p) => ({
    ...p,
    id: uid(),
    layerId: p.layerId ? layerIdMap.get(p.layerId) : undefined,
    addedBy: userId,
  }));
  return { ...guide, id: uid(), ownerId: userId, role: 'owner', layers, places };
}

/**
 * On first sign-in, upload any guides the user built locally (before accounts
 * existed) to their cloud account, then never again. Best-effort: failures are
 * logged and the flag is only set once all uploads succeed.
 */
export async function uploadLocalGuidesOnce(userId: string): Promise<void> {
  if (await AsyncStorage.getItem(MIGRATED_FLAG)) return;

  const local = useGuides.getState().guides.filter((g) => !g.ownerId && g.role !== 'viewer');
  if (local.length === 0) {
    await AsyncStorage.setItem(MIGRATED_FLAG, '1');
    return;
  }

  try {
    for (const guide of local) {
      await pushGuide(rekeyForCloud(guide, userId), userId);
    }
    await AsyncStorage.setItem(MIGRATED_FLAG, '1');
  } catch (e) {
    console.warn('[migration] uploadLocalGuidesOnce failed; will retry next launch', e);
  }
}

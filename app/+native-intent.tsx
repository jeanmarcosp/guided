import { getShareExtensionKey } from 'expo-share-intent';

/**
 * The share extension re-opens the app with a synthetic
 * `guided://dataUrl=<key>` deep link that is not a real route. Send it to the
 * guides home, where the ShareIntent hook picks the payload up and runs the
 * Apple Maps guide import.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return '/';
    }
    return path;
  } catch {
    return '/';
  }
}

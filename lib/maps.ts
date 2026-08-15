import { Linking } from 'react-native';
import { isAppleSearchAvailable, openInMaps } from '@/modules/apple-search';
import type { Place } from '@/lib/types';

/** URL fallback: search Apple Maps for the place, biased to its coordinate. */
function openViaUrl(place: Place) {
  const query = encodeURIComponent(place.name);
  const url = `https://maps.apple.com/?q=${query}&sll=${place.latitude},${place.longitude}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * Open a place in Apple Maps. Prefers the native module (resolves the real POI
 * and opens its place card with photos/reviews); falls back to a URL search.
 */
export function openPlaceInAppleMaps(place: Place) {
  if (isAppleSearchAvailable) {
    openInMaps(place.name, { latitude: place.latitude, longitude: place.longitude }).catch(() =>
      openViaUrl(place),
    );
    return;
  }
  openViaUrl(place);
}

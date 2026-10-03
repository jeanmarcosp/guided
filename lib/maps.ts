import { Linking } from 'react-native';
import { isAppleSearchAvailable, openInMaps, showPlaceCard } from '@/modules/apple-search';
import type { Place } from '@/lib/types';

/** URL fallback: search Apple Maps for the place, biased to its coordinate. */
function openViaUrl(place: Place) {
  const query = encodeURIComponent(place.name);
  const url = `https://maps.apple.com/?q=${query}&sll=${place.latitude},${place.longitude}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * Open a place in the Apple Maps app. A stored Place ID opens the exact place
 * card; legacy places resolve by name near their coordinate. Falls back to a
 * URL search without the native module.
 */
export function openPlaceInAppleMaps(place: Place) {
  if (isAppleSearchAvailable) {
    openInMaps(
      place.name,
      { latitude: place.latitude, longitude: place.longitude },
      place.applePlaceId,
    ).catch(() => openViaUrl(place));
    return;
  }
  openViaUrl(place);
}

/**
 * Show the native Apple Maps place card (photos/reviews/hours) INSIDE the app
 * — iOS 18+'s MKMapItemDetailViewController. Earlier iOS or resolution
 * failures fall back to the Apple Maps app.
 */
export function showPlaceCardInApp(place: Place) {
  if (isAppleSearchAvailable) {
    showPlaceCard(
      place.name,
      { latitude: place.latitude, longitude: place.longitude },
      place.applePlaceId,
    ).catch(() => openViaUrl(place));
    return;
  }
  openViaUrl(place);
}

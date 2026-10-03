import { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  GuidedMapView,
  isValidCoordinate,
  type GuidedMapRef,
  type MapAnnotation,
  type Region,
  type RegionChangeEvent,
} from '@/modules/guided-map';
import { openPlaceInAppleMaps } from '@/lib/maps';
import type { Place } from '@/lib/types';

const FALLBACK_COLOR = '#8E8E93';
const FALLBACK_ICON = 'mappin';

// Same padding as the screen's fitToPlaces, so the native cluster-tap zoom
// frames members above the bottom sheet.
const CLUSTER_FIT_PADDING = { top: 100, left: 60, right: 60, bottom: 360 };

type Props = {
  places: Place[];
  /** layerId -> color, so pins match their layer. */
  layerColors: Record<string, string>;
  /** layerId -> SF Symbol name, drawn as the pin's native glyph. */
  layerIcons: Record<string, string>;
  initialRegion?: Region;
  onMarkerPress?: (place: Place) => void;
  onMapReady?: () => void;
  onRegionChange?: (region: Region, isUserGesture: boolean) => void;
};

/**
 * Thin wrapper over the GuidedMap native module (modules/guided-map), which
 * hosts MKMapView directly. Clustering, split/merge animations, callouts, and
 * selection are all MapKit built-ins — pins merge into Apple Maps-style count
 * bubbles natively, and tapping a bubble zooms to its members.
 *
 * This component only translates Place objects into serialized annotations
 * and native events back into Place callbacks.
 */
const GuideMap = forwardRef<GuidedMapRef, Props>(function GuideMap(
  { places, layerColors, layerIcons, initialRegion, onMarkerPress, onMapReady, onRegionChange },
  ref,
) {
  const annotations = useMemo<MapAnnotation[]>(
    () =>
      places
        .filter((place) => isValidCoordinate(place.latitude, place.longitude))
        .map((place) => ({
          id: place.id,
          latitude: place.latitude,
          longitude: place.longitude,
          title: place.name,
          icon: layerIcons[place.layerId ?? ''] ?? FALLBACK_ICON,
          color: layerColors[place.layerId ?? ''] ?? FALLBACK_COLOR,
          layerId: place.layerId ?? '',
        })),
    [places, layerColors, layerIcons],
  );

  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);

  const handleMarkerPress = useCallback(
    (id: string) => {
      const place = placesById.get(id);
      if (place) onMarkerPress?.(place);
    },
    [placesById, onMarkerPress],
  );

  // The callout's open button: resolve the real Apple POI and show its place
  // card in Apple Maps, same as the old app-drawn callout did.
  const handleCalloutAccessoryPress = useCallback(
    (id: string) => {
      const place = placesById.get(id);
      if (place) openPlaceInAppleMaps(place);
    },
    [placesById],
  );

  const handleRegionChange = useCallback(
    (event: RegionChangeEvent) => {
      const { isUserGesture, ...region } = event;
      onRegionChange?.(region, isUserGesture);
    },
    [onRegionChange],
  );

  return (
    <GuidedMapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      annotations={annotations}
      initialRegion={initialRegion}
      showsUserLocation
      clusterFitPadding={CLUSTER_FIT_PADDING}
      onMapReady={onMapReady}
      onMarkerPress={handleMarkerPress}
      onCalloutAccessoryPress={handleCalloutAccessoryPress}
      onRegionChange={handleRegionChange}
    />
  );
});

export default GuideMap;

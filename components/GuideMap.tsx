import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Callout,
  Marker,
  PROVIDER_DEFAULT,
  type Details,
  type Region,
} from 'react-native-maps';
import { openPlaceInAppleMaps } from '@/lib/maps';
import type { Place } from '@/lib/types';

const FALLBACK_COLOR = '#8E8E93';

type Props = {
  places: Place[];
  /** layerId -> color, so pins match their layer. */
  layerColors: Record<string, string>;
  initialRegion?: Region;
  onMarkerPress?: (place: Place) => void;
  onMapReady?: () => void;
  onRegionChangeComplete?: (region: Region, details: Details) => void;
};

/**
 * Thin wrapper over react-native-maps. On iOS, PROVIDER_DEFAULT renders the
 * native Apple Maps — no token, no API key required.
 */
const GuideMap = forwardRef<MapView, Props>(function GuideMap(
  { places, layerColors, initialRegion, onMarkerPress, onMapReady, onRegionChangeComplete },
  ref
) {
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      onMapReady={onMapReady}
      onRegionChangeComplete={onRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      showsPointsOfInterest={false}
    >
      {places.map((place) => (
        <Marker
          key={place.id}
          coordinate={{ latitude: place.latitude, longitude: place.longitude }}
          pinColor={layerColors[place.layerId ?? ''] ?? FALLBACK_COLOR}
          onPress={() => onMarkerPress?.(place)}
        >
          <Callout onPress={() => openPlaceInAppleMaps(place)}>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle} numberOfLines={1}>
                {place.name}
              </Text>
              <Ionicons name="open-outline" size={17} color="#007AFF" />
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 240,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  calloutTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
});

export default GuideMap;

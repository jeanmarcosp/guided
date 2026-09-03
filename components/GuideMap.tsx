import { Ionicons } from '@expo/vector-icons';
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  type Details,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';
import ClusterMarker from '@/components/ClusterMarker';
import { openPlaceInAppleMaps } from '@/lib/maps';
import type { Place } from '@/lib/types';
import { isValidRegion, parkedCoordinate, useClusters, type ClusterPoint } from '@/lib/useClusters';

const FALLBACK_COLOR = '#8E8E93';
const FALLBACK_EMOJI = '📍';

// Pin geometry. The head is a layer-colored disc with the layer's emoji; the
// tail tucks under its ring so the two read as one shape, and the tail's tip —
// not the head's middle — is what sits on the place's coordinate. The selected
// pin grows, standing in for the enlargement MapKit used to do for us when
// these were default balloons.
const PIN_HEAD = 34;
const PIN_HEAD_SELECTED = 42;
const TAIL_HEIGHT = 8;
const TAIL_OVERLAP = 2;
const SELECTED_PIN_HEIGHT = PIN_HEAD_SELECTED + TAIL_HEIGHT - TAIL_OVERLAP;

// Every place marker's view is this fixed box, whatever it's currently drawing
// (see PlaceMarker). Big enough for the selected pin; the pin sits on the box's
// bottom edge, so `centerOffset` below is a constant too.
const PIN_BOX_WIDTH = 44;
const PIN_BOX_HEIGHT = 50;
const PIN_CENTER_OFFSET = { x: 0, y: -PIN_BOX_HEIGHT / 2 };

// Gap between the selected pin's tip and the callout bubble's tail, in points.
const CALLOUT_OFFSET = SELECTED_PIN_HEIGHT + 8;

// Mirrors the guide screen's DEFAULT_REGION; only used if initialRegion is omitted.
const FALLBACK_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

// Same padding as the screen's fitToPlaces, so cluster zooms frame members
// above the bottom sheet.
const CLUSTER_FIT_PADDING = { top: 100, left: 60, right: 60, bottom: 360 };

type Props = {
  places: Place[];
  /** layerId -> color, so pins match their layer. */
  layerColors: Record<string, string>;
  /** layerId -> emoji, so a pin's category reads at a glance. */
  layerEmojis: Record<string, string>;
  initialRegion?: Region;
  onMarkerPress?: (place: Place) => void;
  /**
   * Fired right before the map moves its own camera (cluster-tap zoom,
   * post-cluster refresh nudge) — lets the owner flag programmatic moves.
   */
  onAutoCameraMove?: () => void;
  onMapReady?: () => void;
  onRegionChangeComplete?: (region: Region, details: Details) => void;
};

type PlaceMarkerProps = {
  place: Place;
  pinColor: string;
  /** The layer's emoji, drawn inside the pin head. */
  emoji: string;
  /** True while this place's callout is open — the pin grows in place. */
  selected: boolean;
  /** True while the place is absorbed into a cluster bubble at this zoom. */
  hidden: boolean;
  /** Unique pool index — picks this marker's own off-screen parking spot. */
  parkingSlot: number;
  onPress: (place: Place) => void;
};

// Pool slot: stays mounted for the map's lifetime (see markers memo below);
// while clustered it parks off-screen and draws nothing, instead of unmounting.
// No <Callout> child: iOS 26 MapKit rebuilds a selected marker's subviews
// during the selection animation and silently drops react-native-maps'
// injected callout view, so the native callout renders blank for any marker
// whose annotation was re-registered. CalloutMarker below replaces it.
//
// Drawn as a custom view rather than a default balloon: `pinColor` alone can't
// carry the layer's emoji. On the Apple provider a custom marker's children
// are a live subview hierarchy (AIRMapMarker becomes the annotation view
// itself), not a rasterized snapshot, so the emoji can't lose a render race.
//
// Three rules keep MapKit from mangling these views, all learned the hard way:
//
//  1. NEVER hide a marker with `opacity`. It maps straight to the annotation
//     view's `alpha`, which MapKit also animates on its own; toggling it
//     mid-animation leaves the view stuck part-way and, because the prop's
//     value hasn't changed, React never restores it. The pin stays a ghost
//     until the map is torn down. Hide by drawing nothing instead.
//  2. Keep the view's FRAME constant. A resized annotation view gets its
//     center shifted by react-native-maps (AIRMapMarker's reactSetFrame) and
//     re-placed by MapKit only on the next region change, so the two disagree
//     in between. The box below is fixed at every state — selection changes
//     only what's drawn inside it — so `centerOffset` is a constant too.
//  3. `collapsable={false}` on that box is load-bearing. A layout-only view
//     with no children is flattened away by React Native, which would leave
//     the marker with zero native subviews — and a marker with no subviews
//     renders as a default MapKit balloon (AIRMapMarker's shouldUsePinView),
//     cached for the annotation's lifetime. A pin that mounted while
//     clustered would then stay a plain red balloon forever.
const PlaceMarker = memo(function PlaceMarker({
  place,
  pinColor,
  emoji,
  selected,
  hidden,
  parkingSlot,
  onPress,
}: PlaceMarkerProps) {
  const head = selected ? PIN_HEAD_SELECTED : PIN_HEAD;
  return (
    <Marker
      // Hidden pins park off-screen and draw nothing, so they can't be seen or
      // tapped.
      coordinate={
        hidden
          ? parkedCoordinate(parkingSlot)
          : { latitude: place.latitude, longitude: place.longitude }
      }
      // Apple Maps centers a custom view on the coordinate; lift the box by
      // half its height so the pin standing on its bottom edge points at the
      // place. Constant, per rule 2 above.
      centerOffset={PIN_CENTER_OFFSET}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      onPress={() => {
        if (!hidden) onPress(place);
      }}
    >
      <View style={styles.pinBox} collapsable={false}>
        {!hidden && (
          <>
            <View
              style={[
                styles.pinHead,
                { width: head, height: head, borderRadius: head / 2, backgroundColor: pinColor },
              ]}
            >
              <Text style={[styles.pinEmoji, selected && styles.pinEmojiSelected]}>{emoji}</Text>
            </View>
            <View style={[styles.pinTail, { borderTopColor: pinColor }]} />
          </>
        )}
      </View>
    </Marker>
  );
});

type CalloutMarkerProps = {
  /** The selected place, or null while no callout is shown. */
  place: Place | null;
  /**
   * Where to hang the bubble — offset north of the pin by the owner. Two
   * annotations must never share a coordinate: MapKit's collision engine
   * would hide the pin (regardless of centerOffset).
   */
  coordinate: { latitude: number; longitude: number } | null;
  parkingSlot: number;
};

// App-drawn callout: a custom-view marker floating above the selected pin.
// Custom-view markers render reliably where the native callout system does
// not (see PlaceMarker). Tapping it opens the place in Apple Maps, exactly
// like the old native callout did. Always mounted (pool invariant); parks
// off-screen and draws nothing while nothing is selected — never `opacity`,
// for the reason spelled out on PlaceMarker.
const CalloutMarker = memo(function CalloutMarker({
  place,
  coordinate,
  parkingSlot,
}: CalloutMarkerProps) {
  const showing = place && coordinate;
  return (
    <Marker
      coordinate={coordinate ?? parkedCoordinate(parkingSlot)}
      // The tail tip sits on this marker's own coordinate.
      centerOffset={{ x: 0, y: -26 }}
      zIndex={10}
      tracksViewChanges={false}
      onPress={() => {
        if (place) openPlaceInAppleMaps(place);
      }}
    >
      <View style={styles.calloutWrap} collapsable={false}>
        {showing && (
          <>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle} numberOfLines={1}>
                {place.name}
              </Text>
              <Ionicons name="open-outline" size={17} color="#007AFF" />
            </View>
            <View style={styles.calloutTail} />
          </>
        )}
      </View>
    </Marker>
  );
});

/**
 * Thin wrapper over react-native-maps. On iOS, PROVIDER_DEFAULT renders the
 * native Apple Maps — no token, no API key required. Nearby pins merge into
 * Apple Maps–style count bubbles; tapping a bubble zooms to its members.
 *
 * Markers are rendered as a FIXED POOL: one PlaceMarker per place plus
 * floor(n/2) ClusterMarker slots (the max possible clusters), all mounted for
 * as long as the places array is unchanged. Zoom changes only flip props
 * (coordinate/opacity/count) — never mount or unmount map children — because
 * react-native-maps' legacy-interop layer throws NSRangeException on the New
 * Architecture when markers are inserted/removed after mount.
 */
const GuideMap = forwardRef<MapView, Props>(function GuideMap(
  {
    places,
    layerColors,
    layerEmojis,
    initialRegion,
    onMarkerPress,
    onAutoCameraMove,
    onMapReady,
    onRegionChangeComplete,
  },
  ref,
) {
  const { height: windowHeight } = useWindowDimensions();

  // Internal handle for cluster-tap camera moves; still forwarded to the parent.
  const mapRef = useRef<MapView | null>(null);
  const setMapRef = useCallback(
    (node: MapView | null) => {
      mapRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Clustering zoom follows settled, validated regions only — a malformed
  // native event can never poison the zoom math.
  const [region, setRegion] = useState<Region>(() => initialRegion ?? FALLBACK_REGION);
  const regionRef = useRef(region);

  // Latest parent callbacks behind stable identities, so the memoized marker
  // elements below don't churn on every parent render.
  const callbacksRef = useRef({ onMarkerPress, onAutoCameraMove, onRegionChangeComplete });
  useEffect(() => {
    callbacksRef.current = { onMarkerPress, onAutoCameraMove, onRegionChangeComplete };
  });

  const { points, getClusterLeaves } = useClusters(places, region);

  const singleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const point of points) {
      if (point.type === 'place') ids.add(point.place.id);
    }
    return ids;
  }, [points]);

  // MapKit defers displaying annotation views that are (re-)added right after
  // a camera animation until the next map interaction. After any
  // hidden -> visible transition of an already-mounted pin, nudge the camera
  // by a fraction of a pixel to force that display pass. Newly added places
  // are excluded so the nudge can't cancel the screen's fit-to-places
  // animation.
  const prevSinglesRef = useRef<{ singles: Set<string>; pool: Set<string> } | null>(null);
  useEffect(() => {
    const prev = prevSinglesRef.current;
    const pool = new Set(places.map((p) => p.id));
    prevSinglesRef.current = { singles: singleIds, pool };
    if (!prev) return; // First commit — the initial fit may still be animating.
    let unhidden = false;
    for (const id of singleIds) {
      if (prev.pool.has(id) && !prev.singles.has(id)) {
        unhidden = true;
        break;
      }
    }
    if (!unhidden) return;
    const timer = setTimeout(() => {
      callbacksRef.current.onAutoCameraMove?.();
      const { latitude, longitude, latitudeDelta, longitudeDelta } = regionRef.current;
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude: longitude + longitudeDelta * 0.0005,
          latitudeDelta,
          longitudeDelta,
        },
        100,
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [singleIds, places]);

  const handleRegionChangeComplete = useCallback((next: Region, details: Details) => {
    if (isValidRegion(next)) {
      regionRef.current = next;
      setRegion(next);
    }
    callbacksRef.current.onRegionChangeComplete?.(next, details);
  }, []);

  // Which place's callout bubble is showing. Cleared by map taps and when the
  // selected place gets absorbed into a cluster.
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  useEffect(() => {
    setSelectedPlace((current) => (current && !singleIds.has(current.id) ? null : current));
  }, [singleIds]);

  // Hang the bubble's tail a pin-height above the place, in map coordinates, so
  // the enlarged selected pin stays fully visible beneath it and the two
  // annotations never share a coordinate (which would collision-hide the pin).
  // Depends on the settled region, so the gap re-normalizes per zoom.
  const bubbleCoordinate = useMemo(() => {
    if (!selectedPlace) return null;
    const latitudePerPoint = region.latitudeDelta / windowHeight;
    return {
      latitude: selectedPlace.latitude + CALLOUT_OFFSET * latitudePerPoint,
      longitude: selectedPlace.longitude,
    };
  }, [selectedPlace, region.latitudeDelta, windowHeight]);

  const handlePlacePress = useCallback((place: Place) => {
    setSelectedPlace(place);
    callbacksRef.current.onMarkerPress?.(place);
  }, []);

  const handleMapPress = useCallback((event: MapPressEvent) => {
    // iOS also fires the map press for marker taps; don't clear for those.
    if ((event.nativeEvent as { action?: string }).action === 'marker-press') return;
    setSelectedPlace(null);
  }, []);

  const handleClusterPress = useCallback(
    (cluster: ClusterPoint) => {
      // Let the parent flag the camera move as programmatic before it starts.
      callbacksRef.current.onAutoCameraMove?.();
      const leaves = getClusterLeaves(cluster);
      if (leaves && leaves.length > 0) {
        mapRef.current?.fitToCoordinates(
          leaves.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: CLUSTER_FIT_PADDING, animated: true },
        );
      } else {
        // Stale cluster id (index rebuilt under the tap): plain step-zoom.
        const { latitudeDelta, longitudeDelta } = regionRef.current;
        mapRef.current?.animateToRegion(
          {
            ...cluster.coordinate,
            latitudeDelta: Math.max(latitudeDelta / 2.5, 0.002),
            longitudeDelta: Math.max(longitudeDelta / 2.5, 0.002),
          },
          400,
        );
      }
    },
    [getClusterLeaves],
  );

  const markers = useMemo(() => {
    const clusters: ClusterPoint[] = [];
    for (const point of points) {
      if (point.type === 'cluster') clusters.push(point);
    }
    // Pool invariant: element count and keys depend on `places` alone, so
    // zoom-driven recomputes update props without touching the child list.
    const slotCount = Math.floor(places.length / 2);
    return [
      ...places.map((place, i) => (
        <PlaceMarker
          key={place.id}
          place={place}
          hidden={!singleIds.has(place.id)}
          selected={selectedPlace?.id === place.id}
          parkingSlot={i}
          pinColor={layerColors[place.layerId ?? ''] ?? FALLBACK_COLOR}
          emoji={layerEmojis[place.layerId ?? ''] ?? FALLBACK_EMOJI}
          onPress={handlePlacePress}
        />
      )),
      ...Array.from({ length: slotCount }, (_, i) => {
        const cluster = clusters[i] ?? null;
        return (
          <ClusterMarker
            key={`cluster-slot-${i}`}
            cluster={cluster}
            parkingSlot={places.length + i}
            color={
              cluster ? (layerColors[cluster.dominantLayerId] ?? FALLBACK_COLOR) : FALLBACK_COLOR
            }
            onPress={handleClusterPress}
          />
        );
      }),
      <CalloutMarker
        key="callout-bubble"
        place={selectedPlace}
        coordinate={bubbleCoordinate}
        parkingSlot={places.length + slotCount}
      />,
    ];
  }, [
    places,
    points,
    singleIds,
    selectedPlace,
    bubbleCoordinate,
    layerColors,
    layerEmojis,
    handlePlacePress,
    handleClusterPress,
  ]);

  return (
    <MapView
      ref={setMapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      onMapReady={onMapReady}
      onPress={handleMapPress}
      onRegionChangeComplete={handleRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      showsPointsOfInterest={false}
    >
      {markers}
    </MapView>
  );
});

const styles = StyleSheet.create({
  // Constant frame (see PlaceMarker rule 2); the pin stands on its bottom edge.
  pinBox: {
    width: PIN_BOX_WIDTH,
    height: PIN_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pinHead: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinEmoji: { fontSize: 16, transform: [{ translateX: 0.5 }] },
  pinEmojiSelected: { fontSize: 20 },
  // Drawn after the head so it notches into the white ring's bottom edge.
  pinTail: {
    marginTop: -TAIL_OVERLAP,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: TAIL_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  calloutWrap: { alignItems: 'center' },
  calloutTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  // The bubble draws its own background (the old native callout's chrome came
  // from SMCalloutView, which CalloutMarker no longer uses).
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 240,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  calloutTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
});

export default GuideMap;

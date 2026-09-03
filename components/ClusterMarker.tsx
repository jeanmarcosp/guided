import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { parkedCoordinate, type ClusterPoint } from '@/lib/useClusters';

type Props = {
  /** The cluster this slot currently shows, or null when the slot is idle. */
  cluster: ClusterPoint | null;
  /** Unique pool index — picks this slot's own off-screen parking spot. */
  parkingSlot: number;
  /** Bubble fill — the cluster's dominant layer color. */
  color: string;
  onPress: (cluster: ClusterPoint) => void;
};

/** The slot's view is always this box, whatever it's currently drawing. */
const BOX = 44;

function bubbleSize(pointCount: number): number {
  if (pointCount >= 100) return 44;
  if (pointCount >= 10) return 38;
  return 32;
}

function countLabel(pointCount: number): string {
  if (pointCount >= 1000) return `${Math.round(pointCount / 100) / 10}k`;
  return String(pointCount);
}

/**
 * Apple Maps–style cluster bubble: a colored circle with a member count.
 * Rendered as a fixed pool slot — the Marker stays mounted for the map's
 * lifetime and only its props change (unmounting map children after mount
 * crashes react-native-maps' interop layer on the New Architecture). An idle
 * slot parks off-screen and draws nothing. No Callout child and no title, so
 * the native map never opens a callout — taps only zoom in. Explicit
 * width/height because the iOS provider sizes the annotation from the child's
 * frame — and that frame stays constant, for the reasons documented on
 * GuideMap's PlaceMarker (which is also why an idle slot must not use
 * `opacity`).
 */
const ClusterMarker = memo(function ClusterMarker({ cluster, parkingSlot, color, onPress }: Props) {
  const size = bubbleSize(cluster?.pointCount ?? 2);
  return (
    <Marker
      coordinate={cluster?.coordinate ?? parkedCoordinate(parkingSlot)}
      onPress={() => cluster && onPress(cluster)}
      // Center the bubble on the coordinate. Apple Maps already centers custom
      // views (centerOffset defaults to 0,0); anchor covers a future Google build.
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      {/* collapsable={false}: an empty layout-only view gets flattened away,
          leaving the marker with no subviews — which react-native-maps renders
          as a default MapKit balloon. See GuideMap's PlaceMarker. */}
      <View style={styles.box} collapsable={false}>
        {cluster && (
          <View
            style={[
              styles.bubble,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
            ]}
          >
            <Text style={[styles.count, cluster.pointCount >= 100 && styles.countSmall]}>
              {countLabel(cluster.pointCount)}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  count: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  countSmall: { fontSize: 12 },
});

export default ClusterMarker;

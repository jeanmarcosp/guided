import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Place } from '@/lib/types';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

const ACTION_WIDTH = 88;
const REVEAL_SNAP = ACTION_WIDTH; // resting open position
const FULL_SWIPE_RATIO = 0.62; // fraction of row width that triggers delete
const VISITED_GREEN = '#34C759'; // iOS system green — "been here" check
const VISITED_DIM = 0.5; // fade a visited row so unvisited places stand out

// Module-level controller so only ONE row stays open at a time.
let closeOpenRow: (() => void) | null = null;

type Props = {
  place: Place;
  color: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** Immediate delete (swipe action). */
  onDelete: () => void;
  /** Disable swipe-to-delete (e.g. a guide shared with you as a viewer). */
  readOnly?: boolean;
  /** This user has marked the place visited — dim it and show a check. */
  visited?: boolean;
};

export default function PlaceRow({
  place,
  color,
  onPress,
  onLongPress,
  onDelete,
  readOnly,
  visited,
}: Props) {
  const colors = useColors();

  const translateX = useSharedValue(0);
  const rowWidth = useSharedValue(Dimensions.get('window').width);
  const startX = useSharedValue(0);

  const close = useCallback(() => {
    translateX.value = withTiming(0, { duration: 180 });
    if (closeOpenRow === close) closeOpenRow = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeOthers = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
  }, [close]);

  const registerOpen = useCallback(() => {
    closeOpenRow = close;
  }, [close]);

  const clearIfCurrent = useCallback(() => {
    if (closeOpenRow === close) closeOpenRow = null;
  }, [close]);

  const remove = useCallback(() => {
    if (closeOpenRow === close) closeOpenRow = null;
    onDelete();
  }, [onDelete, close]);

  // If this row unmounts while it was the open one, release the lock.
  useEffect(() => clearIfCurrent, [clearIfCurrent]);

  const pan = Gesture.Pan()
    .enabled(!readOnly)
    .activeOffsetX([-12, 12]) // only engage on a clearly horizontal drag
    .failOffsetY([-12, 12]) // let vertical scroll / sheet drag win
    .onStart(() => {
      startX.value = translateX.value;
      runOnJS(closeOthers)();
    })
    .onUpdate((e) => {
      translateX.value = Math.min(0, Math.max(-rowWidth.value, startX.value + e.translationX));
    })
    .onEnd(() => {
      const fullThreshold = -rowWidth.value * FULL_SWIPE_RATIO;
      if (translateX.value < fullThreshold) {
        // Full swipe → slide off and delete.
        translateX.value = withTiming(-rowWidth.value, { duration: 160 }, (finished) => {
          if (finished) runOnJS(remove)();
        });
      } else if (translateX.value < -REVEAL_SNAP / 2) {
        translateX.value = withTiming(-REVEAL_SNAP, { duration: 160 });
        runOnJS(registerOpen)();
      } else {
        translateX.value = withTiming(0, { duration: 160 });
        runOnJS(clearIfCurrent)();
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(0, -translateX.value) }));

  function tapDelete() {
    translateX.value = withTiming(-rowWidth.value, { duration: 160 }, (finished) => {
      if (finished) runOnJS(remove)();
    });
  }

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => {
        rowWidth.value = e.nativeEvent.layout.width;
      }}
    >
      {/* Red delete action behind the row */}
      <Reanimated.View style={[styles.action, { backgroundColor: colors.danger }, actionStyle]}>
        <Pressable onPress={tapDelete} style={styles.actionBtn}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </Reanimated.View>

      {/* Sliding row content */}
      <GestureDetector gesture={pan}>
        <Reanimated.View style={[styles.slide, { backgroundColor: colors.surface }, rowStyle]}>
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.dot, { backgroundColor: color }, visited && styles.dimmed]}>
              <Ionicons name="location-sharp" size={16} color="#fff" />
            </View>

            <View style={[styles.body, visited && styles.dimmed]}>
              <Text
                numberOfLines={1}
                style={[typography.bodyMedium, { color: colors.textPrimary }]}
              >
                {place.name}
              </Text>
              {place.category && (
                <Text
                  numberOfLines={1}
                  style={[typography.caption, styles.category, { color: colors.textSecondary }]}
                >
                  {place.category}
                </Text>
              )}
            </View>

            {visited && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={VISITED_GREEN}
                style={styles.visitedCheck}
              />
            )}
          </Pressable>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', justifyContent: 'center' },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  actionBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  slide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 1 },
  category: { textTransform: 'capitalize' },
  dimmed: { opacity: VISITED_DIM },
  visitedCheck: { marginLeft: spacing.sm },
});

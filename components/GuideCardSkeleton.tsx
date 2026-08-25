import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, spacing, useColors } from '@/theme/tokens';

/** Placeholder row shaped like GuideCard, for the loading state before the
 * initial guides fetch resolves. */
export default function GuideCardSkeleton() {
  const colors = useColors();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Animated.View
        style={[styles.emojiWrap, { backgroundColor: colors.surfaceAlt }, pulseStyle]}
      />
      <View style={styles.body}>
        <Animated.View
          style={[styles.line, styles.title, { backgroundColor: colors.surfaceAlt }, pulseStyle]}
        />
        <Animated.View
          style={[styles.line, styles.subtitle, { backgroundColor: colors.surfaceAlt }, pulseStyle]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  emojiWrap: { width: 48, height: 48, borderRadius: radius.sm },
  body: { flex: 1, gap: spacing.xs },
  line: { height: 12, borderRadius: radius.pill },
  title: { width: '50%' },
  subtitle: { width: '30%' },
});

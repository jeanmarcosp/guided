import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

type Props = {
  visible: boolean;
  /** Line under the spinner naming the action, e.g. "Signing out…". */
  label?: string;
};

/**
 * Full-screen scrim with a spinner, for actions that shouldn't be repeated or
 * navigated away from while they're in flight. Being a plain view, it swallows
 * every touch underneath it.
 *
 * Deliberately NOT a <Modal>: callers dismiss this and raise an Alert in the
 * same tick when the action fails, and on iOS a native modal that is still
 * dismissing swallows the alert being presented behind it.
 */
export default function BusyOverlay({ visible, label }: Props) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.scrim]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator size="large" color={colors.textSecondary} />
        {label ? (
          <Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    minWidth: 140,
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchResult } from '@/lib/search';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

type Props = {
  result: SearchResult;
  added: boolean;
  onPress: () => void;
};

export default function SearchResultRow({ result, added, onPress }: Props) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={added}
      style={({ pressed }) => [styles.row, pressed && !added && { opacity: 0.6 }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={[typography.bodyMedium, { color: colors.textPrimary }]}>
          {result.name}
        </Text>
        {(result.address || result.category) && (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
            {result.category ? `${result.category} · ` : ''}
            {result.address}
          </Text>
        )}
      </View>

      <Ionicons
        name={added ? 'checkmark-circle' : 'add-circle-outline'}
        size={24}
        color={added ? colors.accent : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 1 },
});

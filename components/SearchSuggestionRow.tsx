import Icon from '@/components/Icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppleCompletion } from '@/modules/apple-search';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

type Props = {
  completion: AppleCompletion;
  added: boolean;
  /** Resolving the tapped suggestion to coordinates. */
  resolving: boolean;
  onPress: () => void;
};

/**
 * A live type-ahead suggestion (MKLocalSearchCompleter). The characters
 * matching the typed fragment render bold, like Apple Maps' own search field —
 * `titleRanges` are UTF-16 ranges, which is also how JS indexes strings.
 */
export default function SearchSuggestionRow({ completion, added, resolving, onPress }: Props) {
  const colors = useColors();

  // Ranges can overlap (a new keystroke often re-reports the old match plus a
  // longer one) — clamp each one to what's already been emitted so no part of
  // the title ever renders twice.
  const segments: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const range of [...completion.titleRanges].sort((a, b) => a.location - b.location)) {
    const start = Math.max(range.location, cursor);
    const end = Math.min(range.location + range.length, completion.title.length);
    if (end <= start) continue;
    if (start > cursor) {
      segments.push({ text: completion.title.slice(cursor, start), bold: false });
    }
    segments.push({ text: completion.title.slice(start, end), bold: true });
    cursor = end;
  }
  if (cursor < completion.title.length) {
    segments.push({ text: completion.title.slice(cursor), bold: false });
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={added || resolving}
      style={({ pressed }) => [styles.row, pressed && !added && { opacity: 0.6 }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
        <Icon name="mappin" size={18} color={colors.textSecondary} />
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={[typography.body, { color: colors.textPrimary }]}>
          {segments.map((segment, i) => (
            <Text key={i} style={segment.bold && styles.bold}>
              {segment.text}
            </Text>
          ))}
        </Text>
        {!!completion.subtitle && (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
            {completion.subtitle}
          </Text>
        )}
      </View>

      <Icon
        name={added ? 'checkmark.circle.fill' : resolving ? 'ellipsis' : 'plus.circle'}
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
  bold: { fontWeight: '700' },
});

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import AvatarCluster from '@/components/AvatarCluster';
import type { Guide } from '@/lib/types';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

type Props = { guide: Guide };

// Pure visual card — press/long-press are handled by the surrounding
// SwipeActionRow so taps compose correctly with the swipe gesture.
export default function GuideCard({ guide }: Props) {
  const colors = useColors();
  const count = guide.places.length;
  const countLabel = count === 0 ? 'No places yet' : `${count} place${count === 1 ? '' : 's'}`;
  const members = guide.members ?? [];
  const showMembers = members.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.emojiWrap, { backgroundColor: guide.color + '22' }]}>
        <Text style={styles.emoji}>{guide.emoji}</Text>
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={[typography.heading, { color: colors.textPrimary }]}>
          {guide.name}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
          {countLabel}
        </Text>
      </View>

      {showMembers && <AvatarCluster members={members} />}

      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
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
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  body: { flex: 1, gap: 2 },
});

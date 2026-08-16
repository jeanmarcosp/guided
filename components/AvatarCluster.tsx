import { StyleSheet, Text, View } from 'react-native';
import Avatar from '@/components/Avatar';
import type { GuideAccessMember } from '@/lib/types';
import { typography, useColors } from '@/theme/tokens';

type Props = {
  members: GuideAccessMember[];
  size?: number;
  /** Max avatars shown before collapsing the rest into a "+N" bubble. */
  max?: number;
};

/** Overlapping row of member avatars (owner first), with a "+N" overflow bubble. */
export default function AvatarCluster({ members, size = 28, max = 3 }: Props) {
  const colors = useColors();
  if (members.length === 0) return null;

  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  const overlap = Math.round(size * 0.38);
  const ring = { borderColor: colors.surface, borderRadius: size };

  return (
    <View style={styles.row}>
      {shown.map((m, i) => (
        <View key={m.userId} style={[styles.item, ring, i > 0 && { marginLeft: -overlap }]}>
          <Avatar name={m.name} seed={m.userId} size={size} />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.item,
            styles.more,
            ring,
            {
              width: size,
              height: size,
              marginLeft: -overlap,
              backgroundColor: colors.surfaceAlt,
            },
          ]}
        >
          <Text style={[typography.caption, { color: colors.textSecondary }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  item: { borderWidth: 2 },
  more: { alignItems: 'center', justifyContent: 'center' },
});

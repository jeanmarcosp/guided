import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Avatar from '@/components/Avatar';
import {
  createShareLink,
  listShares,
  resolveProfileNames,
  revokeShare,
  type ShareRow,
} from '@/lib/api/shares';
import { useGuides } from '@/store/guides';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

type Member = ShareRow & { name: string };

export default function ShareGuideScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = useGuides((s) => s.guides.find((g) => g.id === id));

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const rows = await listShares(id);
      const template = rows.find((r) => r.shared_with === null);
      setLinkUrl(template ? Linking.createURL(`share/${template.token}`) : null);
      const memberRows = rows.filter(
        (r): r is ShareRow & { shared_with: string } => r.shared_with !== null,
      );
      const nameById = await resolveProfileNames(memberRows.map((r) => r.shared_with));
      setMembers(memberRows.map((r) => ({ ...r, name: nameById.get(r.shared_with) ?? 'Member' })));
    } catch (e: any) {
      Alert.alert('Could not load sharing', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const shareLink = async () => {
    if (!id) return;
    try {
      setBusy(true);
      let url = linkUrl;
      if (!url) {
        const created = await createShareLink(id, 'viewer');
        url = created.url;
        setLinkUrl(url);
      }
      await Share.share({
        message: `Check out my “${guide?.name ?? 'guide'}” on Guided: ${url}`,
      });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = (row: ShareRow) => {
    Alert.alert('Remove access?', 'They will no longer be able to view this guide.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeShare(row.id);
            setMembers((m) => m.filter((r) => r.id !== row.id));
          } catch (e: any) {
            Alert.alert('Could not remove', e?.message ?? 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.header}>
        <Text style={[typography.title, { color: colors.textPrimary }]}>Share guide</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Anyone with the link can view “{guide?.name ?? 'this guide'}”. They’ll need to sign in to
        open it.
      </Text>

      <Pressable
        onPress={shareLink}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.accent, opacity: busy || pressed ? 0.8 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="link" size={18} color="#fff" />
            <Text style={[typography.bodyMedium, { color: '#fff' }]}>
              {linkUrl ? 'Share link' : 'Create & share link'}
            </Text>
          </>
        )}
      </Pressable>

      <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>
        PEOPLE WITH ACCESS
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.textPrimary} style={{ marginTop: spacing.xl }} />
      ) : members.length === 0 ? (
        <Text style={[typography.body, { color: colors.textTertiary }]}>
          No one has opened the link yet.
        </Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
            <Avatar name={m.name} seed={m.shared_with} size={36} />
            <View style={styles.memberInfo}>
              <Text numberOfLines={1} style={[typography.body, { color: colors.textPrimary }]}>
                {m.name}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {m.role === 'editor' ? 'Editor' : 'Viewer'}
              </Text>
            </View>
            <Pressable onPress={() => confirmRevoke(m)} hitSlop={8}>
              <Text style={[typography.body, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radius.sm,
  },
  sectionLabel: { marginTop: spacing.xxl, marginBottom: spacing.md, letterSpacing: 0.5 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: { flex: 1 },
});

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
  updateShareRole,
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
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [linkByRole, setLinkByRole] = useState<{ viewer: string | null; editor: string | null }>({
    viewer: null,
    editor: null,
  });
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const rows = await listShares(id);
      // Reusable link rows (shared_with === null) — one per role.
      const links = { viewer: null as string | null, editor: null as string | null };
      for (const r of rows) {
        if (r.shared_with === null && (r.role === 'viewer' || r.role === 'editor')) {
          links[r.role] = Linking.createURL(`share/${r.token}`);
        }
      }
      setLinkByRole(links);
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
      let url = linkByRole[role];
      if (!url) {
        const created = await createShareLink(id, role);
        url = created.url;
        setLinkByRole((prev) => ({ ...prev, [role]: url }));
      }
      const message =
        role === 'editor'
          ? `Help build my “${guide?.name ?? 'guide'}” on Guided: ${url}`
          : `Check out my “${guide?.name ?? 'guide'}” on Guided: ${url}`;
      await Share.share({ message });
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

  const changeRole = async (member: Member, next: 'viewer' | 'editor') => {
    if (member.role === next) return;
    // Optimistic — the member picks the new role up live via Realtime.
    setMembers((m) => m.map((r) => (r.id === member.id ? { ...r, role: next } : r)));
    try {
      await updateShareRole(member.id, next);
    } catch (e: any) {
      setMembers((m) => m.map((r) => (r.id === member.id ? { ...r, role: member.role } : r)));
      Alert.alert('Could not update', e?.message ?? 'Please try again.');
    }
  };

  const manageMember = (member: Member) => {
    Alert.alert(member.name, 'Set what this person can do with the guide.', [
      { text: 'Can view', onPress: () => changeRole(member, 'viewer') },
      { text: 'Can edit', onPress: () => changeRole(member, 'editor') },
      { text: 'Remove access', style: 'destructive', onPress: () => confirmRevoke(member) },
      { text: 'Cancel', style: 'cancel' },
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
        {role === 'editor'
          ? `Anyone with this link can add and edit places in “${guide?.name ?? 'this guide'}”. They’ll need to sign in to open it.`
          : `Anyone with this link can view “${guide?.name ?? 'this guide'}”. They’ll need to sign in to open it.`}
      </Text>

      <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
        {(['viewer', 'editor'] as const).map((r) => {
          const active = role === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[styles.segmentBtn, active && { backgroundColor: colors.surface }]}
            >
              <Text
                style={[
                  typography.bodyMedium,
                  { color: active ? colors.textPrimary : colors.textSecondary },
                ]}
              >
                {r === 'editor' ? 'Can edit' : 'Can view'}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
              {linkByRole[role] ? 'Share link' : 'Create & share link'}
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
            </View>
            <Pressable
              onPress={() => manageMember(m)}
              hitSlop={8}
              style={({ pressed }) => [styles.roleControl, pressed && { opacity: 0.6 }]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {m.role === 'editor' ? 'Editor' : 'Viewer'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
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
  segment: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm - 2,
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
  roleControl: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

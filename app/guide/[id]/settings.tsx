import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Avatar from '@/components/Avatar';
import { fetchGuideMembers, type GuideMember } from '@/lib/api/shares';
import type { Guide } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useGuides } from '@/store/guides';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

export default function GuideSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = useGuides((s) => s.guides.find((g) => g.id === id));

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.header}>
        <Text
          numberOfLines={1}
          style={[typography.title, styles.headerTitle, { color: colors.textPrimary }]}
        >
          {guide?.name ?? 'Guide'}
        </Text>
        <Pressable onPress={close} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      {guide ? (
        <GuideInfo guide={guide} />
      ) : (
        <Text style={[typography.body, styles.missing, { color: colors.textSecondary }]}>
          Guide not found.
        </Text>
      )}
    </SafeAreaView>
  );
}

function GuideInfo({ guide }: { guide: Guide }) {
  const colors = useColors();
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);

  const shared = guide.role === 'viewer' || guide.role === 'editor';
  // Owned/local guides were created by the current user; shared guides by their owner.
  const meName = profile?.display_name?.trim() || profile?.email || user?.email || 'You';
  const createdByName = shared ? (guide.ownerName ?? 'Unknown') : meName;
  const createdBySeed = shared ? guide.ownerId : (guide.ownerId ?? user?.id ?? 'me');
  const createdOn = new Date(guide.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Section label="CREATED BY">
        <PersonCard name={createdByName} seed={createdBySeed} you={!shared} />
      </Section>

      {(guide.role === 'owner' || shared) && <MembersSection guideId={guide.id} />}

      <Section label="CREATED ON">
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </View>
          <Text style={[typography.body, styles.cardText, { color: colors.textPrimary }]}>
            {createdOn}
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

function MembersSection({ guideId }: { guideId: string }) {
  const colors = useColors();
  const meId = useAuth((s) => s.user?.id);
  const [members, setMembers] = useState<GuideMember[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGuideMembers(guideId)
      .then((m) => {
        if (!cancelled) setMembers(m);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guideId]);

  return (
    <Section label="PEOPLE WITH ACCESS">
      {members === null ? (
        <ActivityIndicator color={colors.textSecondary} style={styles.membersLoading} />
      ) : members.length === 0 ? (
        <Text style={[typography.body, styles.emptyMembers, { color: colors.textTertiary }]}>
          No one has joined yet.
        </Text>
      ) : (
        <View style={styles.memberList}>
          {members.map((m) => (
            <View
              key={m.userId}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Avatar name={m.name} seed={m.userId} size={36} />
              <Text
                numberOfLines={1}
                style={[typography.body, styles.cardText, { color: colors.textPrimary }]}
              >
                {m.name}
                {m.userId === meId && <Text style={{ color: colors.textTertiary }}> (You)</Text>}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {m.role === 'editor' ? 'Editor' : 'Viewer'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

function PersonCard({ name, seed, you }: { name: string; seed?: string | null; you?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar name={name} seed={seed} size={36} />
      <Text
        numberOfLines={1}
        style={[typography.body, styles.cardText, { color: colors.textPrimary }]}
      >
        {name}
        {you && <Text style={{ color: colors.textTertiary }}> (You)</Text>}
      </Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <>
      <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: { flex: 1 },
  missing: { paddingTop: spacing.xl },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardText: { flex: 1 },
  memberList: { gap: spacing.sm },
  membersLoading: { alignSelf: 'flex-start', marginLeft: spacing.xs, paddingVertical: spacing.sm },
  emptyMembers: { marginLeft: spacing.xs, paddingVertical: spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/store/auth';
import { useSettings, type ThemeMode } from '@/store/settings';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'System', icon: 'contrast-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const themeMode = useSettings((s) => s.themeMode);
  const setThemeMode = useSettings((s) => s.setThemeMode);
  const signOut = useAuth((s) => s.signOut);
  const profile = useAuth((s) => s.profile);
  const user = useAuth((s) => s.user);

  const email = profile?.email ?? user?.email ?? null;
  const name = profile?.display_name?.trim() || null;

  function pickTheme(mode: ThemeMode) {
    Haptics.selectionAsync();
    setThemeMode(mode);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your guides stay safe in the cloud.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.title, { color: colors.textPrimary }]}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Avatar name={name ?? email} seed={profile?.id ?? user?.id} size={56} />
          <View style={styles.profileText}>
            <Text style={[typography.heading, { color: colors.textPrimary }]}>
              {name ?? 'Signed in'}
            </Text>
            {email && (
              <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>
                {email}
              </Text>
            )}
          </View>
        </View>

        {/* Appearance */}
        <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>
          APPEARANCE
        </Text>
        <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
          {THEME_OPTIONS.map((opt) => {
            const active = themeMode === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => pickTheme(opt.key)}
                style={[styles.segmentItem, active && { backgroundColor: colors.surface }]}
              >
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={active ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[
                    typography.caption,
                    styles.segmentLabel,
                    { color: active ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Account */}
        <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>
          ACCOUNT
        </Text>
        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [
            styles.rowBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[typography.body, { color: colors.danger }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileText: { flex: 1, gap: 2 },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    padding: spacing.xs,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm - 2,
  },
  segmentLabel: { fontWeight: '600' },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

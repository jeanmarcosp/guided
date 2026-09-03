import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar, { AVATAR_COLORS, colorFor } from '@/components/Avatar';
import AvatarCropper from '@/components/AvatarCropper';
import BusyOverlay from '@/components/BusyOverlay';
import { deleteAvatar, uploadAvatar } from '@/lib/api/profile';
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
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const profile = useAuth((s) => s.profile);
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);

  const email = profile?.email ?? user?.email ?? null;
  const name = profile?.display_name?.trim() || null;

  const userId = profile?.id ?? user?.id ?? null;
  const avatarUrl = profile?.avatar_url ?? null;
  const avatarColor = profile?.avatar_color ?? null;
  // The swatch the current avatar corresponds to (none while a photo is set).
  const activeColor = avatarUrl ? null : (avatarColor ?? colorFor(userId ?? name ?? '?'));
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // The picked-but-not-yet-cropped image shown in the circular cropper overlay.
  const [cropSource, setCropSource] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);

  function pickTheme(mode: ThemeMode) {
    Haptics.selectionAsync();
    setThemeMode(mode);
  }

  // Pick an image, then hand it to our circular cropper (allowsEditing:false — the
  // OS editor is square-only; we do a round crop ourselves in AvatarCropper).
  //
  // We deliberately DON'T call requestMediaLibraryPermissionsAsync(): on iOS
  // launchImageLibraryAsync uses the out-of-process PHPicker (and Android 13+ the
  // system photo picker), which needs no photo-library permission. Requesting it
  // requires NSPhotoLibraryUsageDescription in Info.plist and hard-crashes the app
  // (SIGABRT, no JS error) if that key is missing.
  async function choosePhoto() {
    if (!userId) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset?.uri || !asset.width || !asset.height) return;
      setCropSource({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch (e: any) {
      Alert.alert('Could not open photo', e?.message ?? 'Please try again.');
    }
  }

  // The cropper returns base64 JPEG of the round-framed square → upload it.
  async function applyCroppedAvatar(base64: string) {
    if (!userId) return;
    setCropSource(null);
    try {
      setAvatarBusy(true);
      const url = await uploadAvatar(userId, base64);
      await updateProfile({ avatar_url: url });
      Haptics.selectionAsync();
    } catch (e: any) {
      Alert.alert('Could not update photo', e?.message ?? 'Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removePhoto() {
    if (!userId) return;
    try {
      setAvatarBusy(true);
      await updateProfile({ avatar_url: null });
      await deleteAvatar(userId);
      Haptics.selectionAsync();
    } catch (e: any) {
      Alert.alert('Could not remove photo', e?.message ?? 'Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  // An avatar is a photo OR a color — picking a color clears any uploaded photo.
  async function chooseColor(color: string) {
    if (!userId || avatarBusy) return;
    Haptics.selectionAsync();
    const hadPhoto = !!avatarUrl;
    try {
      await updateProfile({ avatar_color: color, avatar_url: null });
      if (hadPhoto) await deleteAvatar(userId);
    } catch (e: any) {
      Alert.alert('Could not update color', e?.message ?? 'Please try again.');
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your guides stay safe in the cloud.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  async function onSignOut() {
    try {
      setSignOutBusy(true);
      await signOut();
      // Success flips auth status to 'signedOut' and the root layout redirects
      // to sign-in, so leave the spinner up until this screen goes away.
    } catch (e: any) {
      setSignOutBusy(false);
      Alert.alert('Could not sign out', e?.message ?? 'Please try again.');
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and every guide you own — including for anyone you’ve shared them with. Guides others have shared with you are just removed from your view. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: onDeleteAccount },
      ],
    );
  }

  async function onDeleteAccount() {
    try {
      setDeleteBusy(true);
      await deleteAccount();
      // Success flips auth status to 'signedOut'; the root layout redirects
      // to sign-in on its own — nothing left to do on this screen.
    } catch (e: any) {
      setDeleteBusy(false);
      Alert.alert('Could not delete account', e?.message ?? 'Please try again.');
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* The safe-area inset lives on the header, not this root, so BusyOverlay
          below can cover the status bar too: React Native resolves absolute
          offsets against the padding box, so padding here would inset it. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
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
          <Pressable onPress={choosePhoto} disabled={avatarBusy} hitSlop={6}>
            <Avatar
              name={name ?? email}
              seed={userId}
              size={56}
              imageUri={avatarUrl}
              color={avatarColor}
            />
            <View
              style={[
                styles.cameraBadge,
                { backgroundColor: colors.accent, borderColor: colors.surface },
              ]}
            >
              <Ionicons name="camera" size={11} color="#fff" />
            </View>
            {avatarBusy && (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </Pressable>
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

        {/* Avatar */}
        <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>
          AVATAR
        </Text>
        <View
          style={[
            styles.avatarCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.avatarActions}>
            <Pressable
              onPress={choosePhoto}
              disabled={avatarBusy}
              style={({ pressed }) => [
                styles.photoBtn,
                { backgroundColor: colors.surfaceAlt },
                (pressed || avatarBusy) && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="image-outline" size={18} color={colors.accent} />
              <Text style={[typography.body, { color: colors.textPrimary }]}>
                {avatarUrl ? 'Change Photo' : 'Choose Photo'}
              </Text>
            </Pressable>
            {avatarUrl && (
              <Pressable
                onPress={removePhoto}
                disabled={avatarBusy}
                style={({ pressed }) => [
                  styles.photoBtn,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[typography.body, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            )}
          </View>

          <Text style={[typography.caption, { color: colors.textTertiary }]}>Or pick a color</Text>
          <View style={styles.swatchRow}>
            {AVATAR_COLORS.map((c) => {
              const selected = activeColor === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => chooseColor(c)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: c,
                      borderColor: selected ? colors.textPrimary : 'transparent',
                    },
                  ]}
                >
                  {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </Pressable>
              );
            })}
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
          disabled={signOutBusy || deleteBusy}
          style={({ pressed }) => [
            styles.rowBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[typography.body, { color: colors.danger }]}>Sign Out</Text>
        </Pressable>
        <Pressable
          onPress={confirmDeleteAccount}
          disabled={deleteBusy || signOutBusy}
          style={({ pressed }) => [
            styles.rowBtn,
            styles.deleteRowBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            (pressed || deleteBusy || signOutBusy) && { opacity: 0.6 },
          ]}
        >
          {deleteBusy ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          )}
          <Text style={[typography.body, { color: colors.danger }]}>Delete Account</Text>
        </Pressable>
      </ScrollView>

      {cropSource && (
        <AvatarCropper
          uri={cropSource.uri}
          imageWidth={cropSource.width}
          imageHeight={cropSource.height}
          onCancel={() => setCropSource(null)}
          onDone={applyCroppedAvatar}
        />
      )}

      <BusyOverlay visible={signOutBusy} label="Signing out…" />
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
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  avatarActions: { flexDirection: 'row', gap: spacing.sm },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  deleteRowBtn: { marginTop: spacing.sm },
});

import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithApple } from '@/lib/auth/appleAuth';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth/emailAuth';
import { APPLE_SIGN_IN_ENABLED } from '@/lib/config';
import { isSupabaseConfigured } from '@/lib/supabase';
import { radius, spacing, typography, useColors, useEffectiveScheme } from '@/theme/tokens';

export default function SignInScreen() {
  const colors = useColors();
  const scheme = useEffectiveScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!APPLE_SIGN_IN_ENABLED) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const guardConfigured = () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Backend not configured',
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart.'
      );
      return false;
    }
    return true;
  };

  const onApple = async () => {
    if (!guardConfigured()) return;
    try {
      setBusy(true);
      await signInWithApple();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', e?.message ?? 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = async () => {
    if (!guardConfigured()) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('Enter a valid email');
      return;
    }
    try {
      setBusy(true);
      await sendEmailCode(email);
      setStep('code');
    } catch (e: any) {
      Alert.alert('Could not send code', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    if (code.trim().length < 6) {
      Alert.alert('Enter the code from your email');
      return;
    }
    try {
      setBusy(true);
      await verifyEmailCode(email, code);
      // Success: the auth listener flips status and the gate routes home.
    } catch (e: any) {
      Alert.alert('Incorrect or expired code', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.emoji}>🗺️</Text>
          <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>Guided</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Sign in to sync your guides and share them with friends.
          </Text>
        </View>

        <View style={styles.actions}>
          {APPLE_SIGN_IN_ENABLED && Platform.OS === 'ios' && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.sm}
              style={styles.appleButton}
              onPress={onApple}
            />
          )}

          {APPLE_SIGN_IN_ENABLED && appleAvailable && (
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[typography.caption, { color: colors.textTertiary }]}>or</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>
          )}

          {step === 'email' ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                onSubmitEditing={onSendCode}
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                ]}
              />
              <Pressable
                onPress={onSendCode}
                disabled={busy}
                style={[styles.emailButton, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[typography.bodyMedium, { color: '#fff' }]}>Email me a code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Enter the code sent to {email}.
              </Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="Enter code"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoFocus
                onSubmitEditing={onVerifyCode}
                style={[
                  styles.input,
                  styles.codeInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                ]}
              />
              <Pressable
                onPress={onVerifyCode}
                disabled={busy}
                style={[styles.emailButton, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[typography.bodyMedium, { color: '#fff' }]}>Verify &amp; sign in</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => { setStep('email'); setCode(''); }}
                hitSlop={8}
                style={styles.linkBtn}
              >
                <Text style={[typography.caption, { color: colors.accent }]}>Use a different email</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, justifyContent: 'space-between', padding: spacing.xl },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emoji: { fontSize: 56 },
  actions: { gap: spacing.lg, paddingBottom: spacing.xxl },
  appleButton: { height: 50, width: '100%' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  input: {
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    // Explicit letterSpacing shields the placeholder from a Fabric/iOS bug where
    // another input's letterSpacing (e.g. codeInput below) bleeds onto inputs
    // that don't set one — see facebook/react-native#42589.
    letterSpacing: 0,
  },
  emailButton: {
    height: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
  },
  linkBtn: { alignItems: 'center', paddingTop: spacing.xs },
});

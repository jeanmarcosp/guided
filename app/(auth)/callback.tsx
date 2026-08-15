import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { completeMagicLink } from '@/lib/auth/emailAuth';
import { spacing, typography, useColors } from '@/theme/tokens';

/** Handles the magic-link deep link: exchanges tokens for a session. */
export default function AuthCallback() {
  const colors = useColors();
  const router = useRouter();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    completeMagicLink(url)
      .then((ok) => {
        // On success, the auth listener flips status and the gate routes home.
        if (!ok) setError('This sign-in link is invalid or has expired.');
      })
      .catch((e) => setError(e?.message ?? 'Sign-in failed.'));
  }, [url]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <>
          <Text style={[typography.heading, { color: colors.textPrimary, textAlign: 'center' }]}>
            {error}
          </Text>
          <Text
            onPress={() => router.replace('/(auth)/sign-in')}
            style={[typography.body, { color: colors.accent, marginTop: spacing.lg }]}
          >
            Back to sign in
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>
            Signing you in…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});

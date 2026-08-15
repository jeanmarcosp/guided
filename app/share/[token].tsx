import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { acceptShareToken } from '@/lib/api/shares';
import { hydrateGuidesFromServer } from '@/lib/sync/guidesSync';
import { useAuth } from '@/store/auth';
import { spacing, typography, useColors } from '@/theme/tokens';

export default function AcceptShareScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const status = useAuth((s) => s.status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The auth gate will hold un-signed-in users at sign-in; retry once signed in.
    if (status !== 'signedIn' || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const guideId = await acceptShareToken(token);
        await hydrateGuidesFromServer();
        if (!cancelled) router.replace(`/guide/${guideId}`);
      } catch {
        if (!cancelled) setError('This share link is invalid or has expired.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <>
          <Text style={[typography.heading, { color: colors.textPrimary, textAlign: 'center' }]}>
            {error}
          </Text>
          <Pressable onPress={() => router.replace('/')} style={{ marginTop: spacing.lg }}>
            <Text style={[typography.body, { color: colors.accent }]}>Go to my guides</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>
            Opening shared guide…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});

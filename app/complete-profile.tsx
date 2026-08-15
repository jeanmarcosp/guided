import { useState } from 'react';
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
import { useAuth } from '@/store/auth';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

export default function CompleteProfileScreen() {
  const colors = useColors();
  const saveName = useAuth((s) => s.saveName);
  const signOut = useAuth((s) => s.signOut);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Enter your name');
      return;
    }
    try {
      setBusy(true);
      await saveName(name);
      // Once the profile has a name, the auth gate routes into the app.
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
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
          <Text style={styles.emoji}>👋</Text>
          <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>
            What&rsquo;s your name?
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            We&rsquo;ll use it on the guides and places you share with friends.
          </Text>
        </View>

        <View style={styles.actions}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            returnKeyType="done"
            autoFocus
            onSubmitEditing={onSubmit}
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
          />
          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[typography.bodyMedium, { color: '#fff' }]}>Continue</Text>
            )}
          </Pressable>
          <Pressable onPress={() => void signOut()} hitSlop={8} style={styles.linkBtn}>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Sign out</Text>
          </Pressable>
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
  input: {
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    letterSpacing: 0, // guards placeholder against RN#42589 letterSpacing bleed
  },
  button: { height: 50, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  linkBtn: { alignItems: 'center', paddingTop: spacing.xs },
});

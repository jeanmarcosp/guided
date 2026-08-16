import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Appearance, AppState, LogBox, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/lib/queryClient';
import { bootstrapSignedIn, teardownSignedOut } from '@/lib/sync/bootstrap';
import { refreshSharedGuides, startGuidesSync } from '@/lib/sync/guidesSync';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useVisits } from '@/store/visits';
import { useColors, useEffectiveScheme } from '@/theme/tokens';

// Nested reorderable lists (guides home) intentionally place non-scrolling
// lists inside a ScrollView; RN's generic warning is a false positive here.
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

/** Redirect between the auth flow, the name gate, and the app based on state. */
function useProtectedRoute() {
  const status = useAuth((s) => s.status);
  const profile = useAuth((s) => s.profile);
  const segments = useSegments();
  const router = useRouter();

  // A signed-in user without a name must complete their profile before the app.
  const needsName = status === 'signedIn' && !!profile && !profile.display_name?.trim();

  useEffect(() => {
    if (status === 'loading') return;
    const inAuthGroup = segments[0] === '(auth)';
    const onboarding = segments[0] === 'complete-profile';

    if (status === 'signedOut') {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
    } else if (needsName) {
      if (!onboarding) router.replace('/complete-profile');
    } else if (inAuthGroup || onboarding) {
      router.replace('/');
    }
  }, [status, needsName, segments, router]);
}

export default function RootLayout() {
  const colors = useColors();
  const scheme = useEffectiveScheme();
  const themeMode = useSettings((s) => s.themeMode);
  const status = useAuth((s) => s.status);

  // Boot auth + the guide sync engine once.
  useEffect(() => {
    const unsubAuth = useAuth.getState().init();
    const stopSync = startGuidesSync();
    return () => {
      unsubAuth();
      stopSync();
    };
  }, []);

  // Migrate + hydrate on sign-in; clear local state on sign-out.
  useEffect(() => {
    if (status === 'signedIn') void bootstrapSignedIn();
    else if (status === 'signedOut') teardownSignedOut();
  }, [status]);

  // Realtime is the primary path for live updates; this foreground refresh is a
  // reconnection catch-up that reconciles any events missed while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && useAuth.getState().status === 'signedIn') {
        void refreshSharedGuides();
        // Visits aren't on Realtime; re-pull to catch marks made on another device.
        void useVisits.getState().hydrate();
      }
    });
    return () => sub.remove();
  }, []);

  // Force the app's native interface style at runtime so system surfaces
  // (Alerts, ActionSheets, Apple Maps chrome) follow the chosen appearance.
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? null : themeMode);
  }, [themeMode]);

  useProtectedRoute();

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {status === 'loading' ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.background,
              }}
            >
              <ActivityIndicator color={colors.textPrimary} />
            </View>
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
              <Stack.Screen name="index" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="guide/[id]/index" />
              <Stack.Screen name="guide/[id]/search" options={{ presentation: 'modal' }} />
              <Stack.Screen name="guide/[id]/layers" options={{ presentation: 'modal' }} />
              <Stack.Screen name="guide/[id]/share" options={{ presentation: 'modal' }} />
              <Stack.Screen name="guide/[id]/settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="share/[token]" options={{ presentation: 'modal' }} />
            </Stack>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

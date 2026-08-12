import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettings } from '@/store/settings';
import { useColors, useEffectiveScheme } from '@/theme/tokens';

// Nested reorderable lists (guides home) intentionally place non-scrolling
// lists inside a ScrollView; RN's generic warning is a false positive here.
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

export default function RootLayout() {
  const colors = useColors();
  const scheme = useEffectiveScheme();
  const themeMode = useSettings((s) => s.themeMode);

  // Force the app's native interface style at runtime so system surfaces
  // (Alerts, ActionSheets, Apple Maps chrome) follow the chosen appearance.
  // null = follow the device (System).
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? null : themeMode);
  }, [themeMode]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="guide/[id]/index" />
          <Stack.Screen
            name="guide/[id]/search"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="guide/[id]/layers"
            options={{ presentation: 'modal' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

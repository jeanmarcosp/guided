import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';

/**
 * Design tokens for a clean, modern, minimal iOS-flavored look.
 * Colors adapt to light/dark; spacing/radius/type are shared.
 */

export const palette = {
  light: {
    background: '#F2F2F7', // iOS grouped background
    surface: '#FFFFFF',
    surfaceAlt: '#F7F7FA',
    border: '#E4E4E9',
    textPrimary: '#11181C',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    accent: '#007AFF',
    danger: '#FF3B30',
    handle: '#D1D1D6',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    surfaceAlt: '#2C2C2E',
    border: '#3A3A3C',
    textPrimary: '#ECEDEE',
    textSecondary: '#9BA1A6',
    textTertiary: '#6B7280',
    accent: '#0A84FF',
    danger: '#FF453A',
    handle: '#48484A',
  },
};

export type ThemeColors = typeof palette.light;

/** iOS system colors — used for per-guide identity + map pins. */
export const GUIDE_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
];

export const GUIDE_EMOJIS = [
  '🗺️',
  '🍜',
  '☕️',
  '🏖️',
  '🍷',
  '🏛️',
  '🗽',
  '🎨',
  '🌃',
  '⛰️',
  '🛍️',
  '🎵',
  '🌮',
];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const typography = {
  largeTitle: { fontSize: 32, fontWeight: '700' as const, letterSpacing: 0.2 },
  title: { fontSize: 24, fontWeight: '700' as const },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

/**
 * Resolves the effective light/dark scheme, honoring the user's Appearance
 * preference (System / Light / Dark) over the device setting.
 */
export function useEffectiveScheme(): 'light' | 'dark' {
  const device = useColorScheme();
  const mode = useSettings((s) => s.themeMode);
  const effective = mode === 'system' ? device : mode;
  return effective === 'dark' ? 'dark' : 'light';
}

/** Returns the active color set for the effective scheme. */
export function useColors(): ThemeColors {
  return useEffectiveScheme() === 'dark' ? palette.dark : palette.light;
}

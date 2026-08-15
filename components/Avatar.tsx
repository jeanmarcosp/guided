import { StyleSheet, Text, View } from 'react-native';

// Curated, vibrant palette — every color reads well behind white text.
const AVATAR_COLORS = [
  '#FF3B30',
  '#34C759',
  '#FFCC00',
  '#FF9500',
  '#AF52DE',
  '#5856D6',
  '#007AFF',
  '#FF2D55',
];

/** Deterministic pick so a given person always gets the same color. */
function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type Props = {
  /** Display name or email — its first character is shown. */
  name?: string | null;
  /** Stable identity used to pick the color (falls back to name). */
  seed?: string | null;
  size?: number;
};

/** A circular initial avatar with a per-person color. */
export default function Avatar({ name, seed, size = 26 }: Props) {
  const letter = (name?.trim().charAt(0) || '?').toUpperCase();
  const bg = colorFor(seed || name || '?');
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
    >
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.46) }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '700' },
});

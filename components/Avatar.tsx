import { Image, StyleSheet, Text, View } from 'react-native';

// Curated, vibrant palette — every color reads well behind white text. Also the
// set offered in the avatar-color picker (settings), so keep them in sync.
export const AVATAR_COLORS = [
  '#FF3B30',
  '#34C759',
  '#FFCC00',
  '#FF9500',
  '#AF52DE',
  '#5856D6',
  '#007AFF',
  '#FF2D55',
];

/** Deterministic pick so a given person always gets the same color by default. */
export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type Props = {
  /** Display name or email — its first character is shown. */
  name?: string | null;
  /** Stable identity used to pick the fallback color (falls back to name). */
  seed?: string | null;
  size?: number;
  /** If set, the avatar shows this uploaded image instead of an initial. */
  imageUri?: string | null;
  /** Chosen background color for the initial; falls back to a deterministic one. */
  color?: string | null;
};

/** A circular avatar: an uploaded image if present, else an initial on a color. */
export default function Avatar({ name, seed, size = 26, imageUri, color }: Props) {
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={[styles.circle, dim]} resizeMode="cover" />;
  }

  const letter = (name?.trim().charAt(0) || '?').toUpperCase();
  const bg = color || colorFor(seed || name || '?');
  return (
    <View style={[styles.circle, dim, { backgroundColor: bg }]}>
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.46) }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '700' },
});

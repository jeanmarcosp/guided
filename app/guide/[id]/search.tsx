import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SearchResultRow from '@/components/SearchResultRow';
import { searchPlaces, type SearchResult } from '@/lib/search';
import { useGuides } from '@/store/guides';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

const coordKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, lat, lng } = useLocalSearchParams<{ id: string; lat?: string; lng?: string }>();

  const guide = useGuides((s) => s.guides.find((g) => g.id === id));
  const addPlaceToGuide = useGuides((s) => s.addPlaceToGuide);

  // Primary bias = the map's center passed in from the guide screen (the area
  // the user is looking at). Falls back to device location if none was passed.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | undefined>(() =>
    lat && lng ? { latitude: parseFloat(lat), longitude: parseFloat(lng) } : undefined
  );

  const addedKeys = useMemo(
    () => new Set((guide?.places ?? []).map((p) => coordKey(p.latitude, p.longitude))),
    [guide?.places]
  );

  // Only fall back to device location if the map center wasn't provided.
  useEffect(() => {
    if (near) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync();
        const pos = last ?? (await Location.getCurrentPositionAsync({}));
        if (pos) setNear({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // Location is optional — search still works without a bias.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search with cancellation of in-flight requests.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await searchPlaces(q, near, controller.signal);
        setResults(res);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('Could not load results. Check your connection.');
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, near]);

  function handleAdd(result: SearchResult) {
    if (!guide) return;
    if (addedKeys.has(coordKey(result.latitude, result.longitude))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPlaceToGuide(guide.id, result);
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search places"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { color: colors.textPrimary }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          hitSlop={8}
        >
          <Text style={[typography.bodyMedium, { color: colors.accent }]}>Done</Text>
        </Pressable>
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>{error}</Text>
        </View>
      ) : query.trim().length < 2 ? (
        <View style={styles.center}>
          <Ionicons name="search" size={28} color={colors.textTertiary} />
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Results are near the map&apos;s current area. Pan the map to another city to
            search there.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No results for “{query.trim()}”.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r, i) => `${coordKey(r.latitude, r.longitude)}-${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          renderItem={({ item }) => (
            <SearchResultRow
              result={item}
              added={addedKeys.has(coordKey(item.latitude, item.longitude))}
              onPress={() => handleAdd(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.sm,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 0, letterSpacing: 0 }, // letterSpacing guards vs RN#42589
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
});

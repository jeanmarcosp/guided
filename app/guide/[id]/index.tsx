import BottomSheet, { BottomSheetSectionList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MenuView, type MenuAction } from '@react-native-menu/menu';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type MapView from 'react-native-maps';
import { type Details, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GuideMap from '@/components/GuideMap';
import PlaceRow from '@/components/PlaceRow';
import { openPlaceInAppleMaps } from '@/lib/maps';
import type { Layer, Place } from '@/lib/types';
import { useGuides } from '@/store/guides';
import { useVisits } from '@/store/visits';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

const RECENTER_SIZE = 44;
const CONTROLS_HEIGHT = RECENTER_SIZE * 4 + 8 * 3; // zoom in/out + locate + fit-all, stacked

// The sheet opens at snapPoints[1] ('45%'). gorhom lays the scroll content out
// against the tallest snap (90%), so to center the empty message within the
// *visible* default height we size its block to that 45% region ourselves.
const DEFAULT_SNAP_FRACTION = 0.45;
const SHEET_HANDLE_HEIGHT = 24; // gorhom's DEFAULT_HANDLE_HEIGHT

export default function GuideDetail() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const guide = useGuides((s) => s.guides.find((g) => g.id === id));
  const removePlaceFromGuide = useGuides((s) => s.removePlaceFromGuide);
  const movePlaceToLayer = useGuides((s) => s.movePlaceToLayer);
  const toggleLayerHidden = useGuides((s) => s.toggleLayerHidden);
  const toggleLayerCollapsed = useGuides((s) => s.toggleLayerCollapsed);
  const setAllLayersHidden = useGuides((s) => s.setAllLayersHidden);
  const setAllLayersCollapsed = useGuides((s) => s.setAllLayersCollapsed);

  // Personal "visited" marks — private to this user (see store/visits.ts).
  const visited = useVisits((s) => s.visited);
  const toggleVisited = useVisits((s) => s.toggle);

  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapReady = useRef(false);
  const prevCount = useRef(guide?.places.length ?? 0);
  const programmaticMove = useRef(false); // a camera move we initiated
  const suppressUntil = useRef(Date.now() + 1000); // swallow trailing settle events
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [sheetHeaderHeight, setSheetHeaderHeight] = useState(0);

  // Height of the list area visible at the default (45%) snap, so the empty-state
  // message centers within what the user actually sees on first open.
  const emptyStateHeight = Math.max(
    0,
    windowHeight * DEFAULT_SNAP_FRACTION - SHEET_HANDLE_HEIGHT - sheetHeaderHeight,
  );

  // Peek (title bar only, full map) · medium · large — like Apple Maps.
  const snapPoints = useMemo(() => [120, '45%', '90%'], []);
  const places = useMemo(() => guide?.places ?? [], [guide?.places]);
  const layers = useMemo(() => guide?.layers ?? [], [guide?.layers]);

  // A guide shared with you as a viewer is read-only; editors and owners can add,
  // edit, and remove places/layers. Only the owner (or an un-synced local guide,
  // role undefined) can share it — editors can't re-share. Live updates arrive
  // via Realtime (lib/sync/realtime.ts), so no focus-based refresh here.
  const canEdit = guide?.role !== 'viewer';
  const isOwner = guide?.role === 'owner' || guide?.role === undefined;

  const visitedCount = useMemo(
    () => places.reduce((n, p) => (visited[p.id] ? n + 1 : n), 0),
    [places, visited],
  );

  const placesLabel =
    places.length === 0
      ? 'No places yet'
      : `${places.length} place${places.length === 1 ? '' : 's'}` +
        (visitedCount > 0 ? ` · ${visitedCount} visited` : '');

  const layerColors = useMemo(
    () => Object.fromEntries(layers.map((l) => [l.id, l.color])),
    [layers],
  );

  // Places whose layer isn't hidden — what the map actually shows.
  const visiblePlaces = useMemo(() => {
    const hiddenIds = new Set(layers.filter((l) => l.hidden).map((l) => l.id));
    return places.filter((p) => !hiddenIds.has(p.layerId ?? ''));
  }, [places, layers]);

  // One section per layer, in the guide's layer order. A collapsed layer keeps
  // its header but shows no rows (collapse is list-only; hide affects pins).
  const sections = useMemo(() => {
    const byLayer = new Map<string, Place[]>();
    for (const p of places) {
      const key = p.layerId ?? '';
      const arr = byLayer.get(key) ?? [];
      arr.push(p);
      byLayer.set(key, arr);
    }
    return layers.map((layer) => {
      const all = byLayer.get(layer.id) ?? [];
      return { layer, count: all.length, data: layer.collapsed ? [] : all };
    });
  }, [places, layers]);

  // Tracks the top edge of the bottom sheet so the map controls ride above it.
  const sheetTop = useSharedValue(0);
  const controlsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTop.value - CONTROLS_HEIGHT - spacing.md }],
  }));

  const fitToPlaces = useCallback(
    (animated: boolean) => {
      if (!mapReady.current || visiblePlaces.length === 0) return;
      programmaticMove.current = true;
      if (visiblePlaces.length === 1) {
        mapRef.current?.animateToRegion(
          {
            latitude: visiblePlaces[0].latitude,
            longitude: visiblePlaces[0].longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          animated ? 400 : 0,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(
        visiblePlaces.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        { edgePadding: { top: 100, left: 60, right: 60, bottom: 360 }, animated },
      );
    },
    [visiblePlaces],
  );

  function collapseLayer(layer: Layer) {
    Haptics.selectionAsync();
    toggleLayerCollapsed(guide!.id, layer.id);
  }

  function hideLayer(layer: Layer) {
    Haptics.selectionAsync();
    toggleLayerHidden(guide!.id, layer.id);
  }

  const allHidden = layers.length > 0 && layers.every((l) => l.hidden);
  const allCollapsed = layers.length > 0 && layers.every((l) => l.collapsed);

  function toggleShowAll() {
    Haptics.selectionAsync();
    setAllLayersHidden(guide!.id, !allHidden);
  }

  function toggleCollapseAll() {
    Haptics.selectionAsync();
    setAllLayersCollapsed(guide!.id, !allCollapsed);
  }

  // Center the map on the user's current location.
  async function locateMe() {
    Haptics.selectionAsync();
    setShowSearchArea(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      programmaticMove.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500,
      );
    } catch {
      // Ignore — location is optional.
    }
  }

  // Step the camera zoom. halve the altitude to zoom in, double it to zoom out
  // (Apple Maps camera; the zoom fallback covers a Google provider).
  async function zoomBy(factor: number) {
    Haptics.selectionAsync();
    try {
      const cam = await mapRef.current?.getCamera();
      if (!cam) return;
      programmaticMove.current = true;
      if (cam.altitude) {
        mapRef.current?.animateCamera({ altitude: cam.altitude * factor }, { duration: 250 });
      } else if (cam.zoom != null) {
        mapRef.current?.animateCamera({ zoom: cam.zoom - Math.log2(factor) }, { duration: 250 });
      }
    } catch {
      // Ignore — map may not be ready yet.
    }
  }

  // Show "Search this area" only for genuine user pans. Our own camera moves set
  // `programmaticMove`; we clear it when that move completes and swallow the
  // trailing settle event for a moment. (isGesture is unreliable on iOS.)
  function handleRegionChange(_region: Region, _details: Details) {
    const now = Date.now();
    if (programmaticMove.current) {
      programmaticMove.current = false;
      suppressUntil.current = now + 800;
      return;
    }
    if (now < suppressUntil.current) return;
    setShowSearchArea(true);
  }

  function searchThisArea() {
    setShowSearchArea(false);
    openSearch();
  }

  // Native (liquid-glass) long-press menu for a place: open in Maps, move layer, remove.
  function placeMenuActions(place: Place): MenuAction[] {
    const actions: MenuAction[] = [{ id: 'open', title: 'Open in Apple Maps' }];
    // "Visited" is a personal mark, so every role (viewers included) gets it.
    // `state` renders the native checkmark when the place is already visited.
    actions.push({ id: 'visited', title: 'Visited', state: visited[place.id] ? 'on' : 'off' });
    if (!canEdit) return actions; // viewers can open + mark visited, not modify
    const targets = layers.filter((l) => l.id !== place.layerId);
    if (targets.length > 0) {
      actions.push({
        id: 'move',
        title: 'Move to Layer',
        subactions: targets.map((l) => ({ id: `move:${l.id}`, title: `${l.emoji}  ${l.name}` })),
      });
    }
    actions.push({
      id: 'remove',
      title: 'Remove from Guide',
      attributes: { destructive: true },
    });
    return actions;
  }

  function handlePlaceMenuAction(place: Place, event: string) {
    if (!guide) return;
    if (event === 'open') {
      openPlaceInAppleMaps(place);
    } else if (event === 'visited') {
      Haptics.selectionAsync();
      toggleVisited(place.id);
    } else if (event.startsWith('move:')) {
      Haptics.selectionAsync();
      movePlaceToLayer(guide.id, place.id, event.slice('move:'.length));
    } else if (event === 'remove') {
      confirmRemove(place);
    }
  }

  // Center on the user when a fresh guide has no places yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (places.length > 0) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const pos = await Location.getLastKnownPositionAsync();
      const loc = pos ?? (await Location.getCurrentPositionAsync({}));
      if (!loc || cancelled) return;
      programmaticMove.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        500,
      );
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a place is added (e.g. returning from search), reframe the map to fit
  // ALL pins — like Apple Maps guides.
  useEffect(() => {
    if (places.length > prevCount.current) {
      fitToPlaces(true);
    }
    prevCount.current = places.length;
  }, [places, fitToPlaces]);

  function focusPlace(place: Place) {
    Haptics.selectionAsync();
    sheetRef.current?.snapToIndex(1); // medium — keep the list visible, reveal the map
    programmaticMove.current = true;
    // Pan to the pin at the current zoom (gentle) rather than zooming in hard.
    mapRef.current?.animateCamera(
      { center: { latitude: place.latitude, longitude: place.longitude } },
      { duration: 600 },
    );
  }

  function confirmRemove(place: Place) {
    Alert.alert('Remove place?', `Remove "${place.name}" from this guide?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => guide && removePlaceFromGuide(guide.id, place.id),
      },
    ]);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  // Open search biased to whatever the map is currently centered on, so users
  // pan to a city (e.g. Miami) and get results there — not near their phone.
  async function openSearch() {
    if (!guide) return;
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const cam = await mapRef.current?.getCamera();
      if (cam?.center) {
        lat = cam.center.latitude;
        lng = cam.center.longitude;
      }
    } catch {
      // Fall back to no map bias; the search screen will try device location.
    }
    router.push({
      pathname: '/guide/[id]/search',
      params: {
        id: guide.id,
        ...(lat != null && lng != null ? { lat: String(lat), lng: String(lng) } : {}),
      },
    });
  }

  // Guide was deleted while open.
  if (!guide) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <Text style={[typography.body, { color: colors.textSecondary }]}>Guide not found.</Text>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: spacing.md }}>
          <Text style={[typography.bodyMedium, { color: colors.accent }]}>Back to guides</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <GuideMap
        ref={mapRef}
        places={visiblePlaces}
        layerColors={layerColors}
        initialRegion={DEFAULT_REGION}
        onMarkerPress={focusPlace}
        onAutoCameraMove={() => {
          programmaticMove.current = true;
        }}
        onRegionChangeComplete={handleRegionChange}
        onMapReady={() => {
          mapReady.current = true;
          programmaticMove.current = true;
          fitToPlaces(false);
        }}
      />

      {/* Floating top bar */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable
          onPress={goBack}
          style={[styles.circleBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={[styles.titlePill, { backgroundColor: colors.surface }]}>
          <Text style={styles.titleEmoji}>{guide.emoji}</Text>
          <Text
            numberOfLines={1}
            style={[typography.bodyMedium, { color: colors.textPrimary, maxWidth: 180 }]}
          >
            {guide.name}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(`/guide/${guide.id}/settings`)}
          style={[styles.circleBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* "Search this area" pill — appears after the user pans the map */}
      {showSearchArea && (
        <View style={[styles.searchAreaWrap, { top: insets.top + 58 }]} pointerEvents="box-none">
          <Pressable
            onPress={searchThisArea}
            style={({ pressed }) => [
              styles.searchAreaPill,
              { backgroundColor: colors.surface },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="search" size={15} color={colors.accent} />
            <Text style={[typography.caption, styles.searchAreaText, { color: colors.accent }]}>
              Search this area
            </Text>
          </Pressable>
        </View>
      )}

      {/* Floating map controls — ride just above the sheet */}
      <Animated.View style={[styles.controlsWrap, { right: spacing.lg }, controlsStyle]}>
        <Pressable
          onPress={() => zoomBy(0.5)}
          style={[styles.recenterBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => zoomBy(2)}
          style={[styles.recenterBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="remove" size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={locateMe}
          style={[styles.recenterBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="locate" size={22} color={colors.accent} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setShowSearchArea(false);
            fitToPlaces(true);
          }}
          disabled={visiblePlaces.length === 0}
          style={[styles.recenterBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons
            name="scan-outline"
            size={22}
            color={visiblePlaces.length === 0 ? colors.textTertiary : colors.textPrimary}
          />
        </Pressable>
      </Animated.View>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        animatedPosition={sheetTop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.handle }}
      >
        <View
          style={styles.sheetHeader}
          onLayout={(e) => setSheetHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.sheetHeaderText}>
            <Text numberOfLines={1} style={[typography.title, { color: colors.textPrimary }]}>
              {guide.name}
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
              {placesLabel}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {isOwner && (
              <Pressable
                onPress={() => router.push(`/guide/${guide.id}/share`)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={6}
              >
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
              </Pressable>
            )}
            {canEdit && (
              <Pressable
                onPress={() => router.push(`/guide/${guide.id}/layers`)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={6}
              >
                <Ionicons name="layers-outline" size={20} color={colors.textPrimary} />
              </Pressable>
            )}
            {canEdit && (
              <Pressable
                onPress={openSearch}
                style={({ pressed }) => [
                  styles.addPlace,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={[typography.bodyMedium, { color: '#fff' }]}>Add</Text>
              </Pressable>
            )}
          </View>
        </View>

        {layers.length > 0 && (
          <View style={styles.toolbar}>
            <Pressable
              onPress={toggleShowAll}
              style={({ pressed }) => [
                styles.toolBtn,
                { backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name={allHidden ? 'eye-outline' : 'eye-off-outline'}
                size={15}
                color={colors.textSecondary}
              />
              <Text style={[typography.caption, styles.toolLabel, { color: colors.textSecondary }]}>
                {allHidden ? 'Show all' : 'Hide all'}
              </Text>
            </Pressable>

            <Pressable
              onPress={toggleCollapseAll}
              style={({ pressed }) => [
                styles.toolBtn,
                { backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name={allCollapsed ? 'chevron-down' : 'chevron-up'}
                size={15}
                color={colors.textSecondary}
              />
              <Text style={[typography.caption, styles.toolLabel, { color: colors.textSecondary }]}>
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Text>
            </Pressable>
          </View>
        )}

        <BottomSheetSectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          ListEmptyComponent={
            <View style={[styles.sheetEmpty, { height: emptyStateHeight }]}>
              <Ionicons name="location-outline" size={30} color={colors.textTertiary} />
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Tap “Add” to search for places and drop them on the map.
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Pressable
              onPress={() => collapseLayer(section.layer)}
              style={({ pressed }) => [styles.layerHeader, pressed && { opacity: 0.6 }]}
            >
              <Ionicons
                name={section.layer.collapsed ? 'chevron-forward' : 'chevron-down'}
                size={16}
                color={colors.textTertiary}
              />
              <View style={[styles.layerBadge, { backgroundColor: section.layer.color + '22' }]}>
                <Text style={styles.layerEmoji}>{section.layer.emoji}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={[typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}
              >
                {section.layer.name}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.textTertiary, marginRight: spacing.md },
                ]}
              >
                {section.count}
              </Text>
              <Pressable onPress={() => hideLayer(section.layer)} hitSlop={10}>
                <Ionicons
                  name={section.layer.hidden ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={section.layer.hidden ? colors.textTertiary : colors.accent}
                />
              </Pressable>
            </Pressable>
          )}
          renderItem={({ item, section }) => (
            <MenuView
              title={item.name}
              shouldOpenOnLongPress
              actions={placeMenuActions(item)}
              onPressAction={({ nativeEvent }) => handlePlaceMenuAction(item, nativeEvent.event)}
            >
              <PlaceRow
                place={item}
                color={section.layer.color}
                onPress={() => focusPlace(item)}
                onDelete={() => removePlaceFromGuide(guide.id, item.id)}
                readOnly={!canEdit}
                visited={!!visited[item.id]}
              />
            </MenuView>
          )}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  controlsWrap: {
    position: 'absolute',
    top: 0,
    gap: spacing.sm,
  },
  searchAreaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  searchAreaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchAreaText: { fontWeight: '600' },
  recenterBtn: {
    width: RECENTER_SIZE,
    height: RECENTER_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  titleEmoji: { fontSize: 18 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  sheetHeaderText: { flex: 1, marginRight: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  toolLabel: { fontWeight: '600' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  sheetEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  layerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  layerBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerEmoji: { fontSize: 15 },
});

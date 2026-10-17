import BottomSheet, { BottomSheetSectionList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from '@/components/Icon';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GuidedMapRef, Region } from '@/modules/guided-map';
import GlassSurface from '@/components/GlassSurface';
import GuideMap from '@/components/GuideMap';
import LayerIcon from '@/components/LayerIcon';
import PlaceRow from '@/components/PlaceRow';
import { openPlaceInAppleMaps } from '@/lib/maps';
import type { Layer, Place } from '@/lib/types';
import { useGuides } from '@/store/guides';
import { useVisits } from '@/store/visits';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

/** Matches a saved place by name. */
function placeMatches(p: Place, q: string): boolean {
  return p.name.toLowerCase().includes(q);
}

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

const RECENTER_SIZE = 44;
// Zoom capsule (2 buttons merged, Apple Maps-style) + locate + fit-all circles.
const CONTROLS_HEIGHT = RECENTER_SIZE * 4 + 8 * 2;

// Floating-card corner radius — concentric with the device's display corners
// (≈ display radius minus the 8pt margin). Glass background AND content clips
// share it so nothing pokes past the curve.
const CARD_RADIUS = 52;

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

  const mapRef = useRef<GuidedMapRef>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapReady = useRef(false);
  const prevCount = useRef(guide?.places.length ?? 0);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [sheetHeaderHeight, setSheetHeaderHeight] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  // Height of the list area visible at the default (45%) snap, so the empty-state
  // message centers within what the user actually sees on first open.
  const emptyStateHeight = Math.max(
    0,
    windowHeight * DEFAULT_SNAP_FRACTION - SHEET_HANDLE_HEIGHT - sheetHeaderHeight,
  );

  // Peek (floating title pill, full map) · medium · large — like Apple Maps.
  // The peek snap includes the pill's floating gap: visible pill (88) + gap.
  // Concentric with the device: the gap matches the side margins, and the home
  // indicator overlays the card (exactly how Apple's floating sheets sit).
  const pillGap = spacing.sm;
  const snapPoints = useMemo(() => [88 + pillGap, '45%', '90%'], [pillGap]);
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

  const layerIcons = useMemo(() => Object.fromEntries(layers.map((l) => [l.id, l.icon])), [layers]);

  // Places whose layer isn't hidden — what the map actually shows.
  const visiblePlaces = useMemo(() => {
    const hiddenIds = new Set(layers.filter((l) => l.hidden).map((l) => l.id));
    return places.filter((p) => !hiddenIds.has(p.layerId ?? ''));
  }, [places, layers]);

  // When searching, narrow the pins to matches; otherwise show every visible pin.
  const mapPlaces = useMemo(
    () => (searching ? visiblePlaces.filter((p) => placeMatches(p, query)) : visiblePlaces),
    [searching, query, visiblePlaces],
  );

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
    // While searching, show matches across every layer (even collapsed ones) and
    // drop layers with no match. Otherwise respect each layer's collapsed state.
    if (searching) {
      return layers
        .map((layer) => {
          const matches = (byLayer.get(layer.id) ?? []).filter((p) => placeMatches(p, query));
          return { layer, count: matches.length, data: matches };
        })
        .filter((s) => s.count > 0);
    }
    return layers.map((layer) => {
      const all = byLayer.get(layer.id) ?? [];
      return { layer, count: all.length, data: layer.collapsed ? [] : all };
    });
  }, [places, layers, searching, query]);

  // Tracks the top edge of the bottom sheet so the map controls ride above it.
  const sheetTop = useSharedValue(0);
  const controlsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTop.value - CONTROLS_HEIGHT - spacing.md }],
  }));

  // iOS 26 Maps-style floating card: the glass background floats a constant
  // gap above the screen bottom at EVERY detent (rounded corners all around,
  // like Apple Maps). gorhom sizes the background to the sheet's visible
  // height, so the card edge is just a constant bottom inset — but the CONTENT
  // runs to the full surface bottom far below the screen, so the scroll area
  // gets an explicit animated height ending at the card's edge instead.
  const collapsedPosition = windowHeight - (snapPoints[0] as number);
  // The background is sized to the sheet's full surface (whose bottom sits far
  // below the screen at low detents) — measure it and lift the glass's bottom
  // edge to exactly (screen bottom - gap).
  const surfaceHeight = useSharedValue(windowHeight);
  const sheetBgStyle = useAnimatedStyle(() => ({
    bottom: Math.max(0, sheetTop.value + surfaceHeight.value - windowHeight + pillGap),
  }));
  const contentHeightStyle = useAnimatedStyle(() => ({
    height: Math.max(
      0,
      windowHeight - pillGap - sheetTop.value - SHEET_HANDLE_HEIGHT - sheetHeaderHeight,
    ),
  }));
  // Below the collapsed pill line, content fades out as the sheet approaches
  // the bottom snap — only the title row remains in the pill.
  const belowPillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetTop.value,
      [collapsedPosition - 90, collapsedPosition - 20],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const fitToPlaces = useCallback(
    (animated: boolean) => {
      if (!mapReady.current || visiblePlaces.length === 0) return;
      if (visiblePlaces.length === 1) {
        mapRef.current?.setRegion(
          {
            latitude: visiblePlaces[0].latitude,
            longitude: visiblePlaces[0].longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          animated,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(
        visiblePlaces.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        { top: 100, left: 60, right: 60, bottom: 360 },
        animated,
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
      mapRef.current?.setRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        true,
      );
    } catch {
      // Ignore — location is optional.
    }
  }

  // Step the camera zoom: halve the altitude to zoom in, double it to zoom out.
  async function zoomBy(factor: number) {
    Haptics.selectionAsync();
    try {
      await mapRef.current?.zoomBy(factor);
    } catch {
      // Ignore — map may not be ready yet.
    }
  }

  // Show "Search this area" only for genuine user pans. The native map tells
  // gestures and app-driven camera moves apart.
  function handleRegionChange(_region: Region, isUserGesture: boolean) {
    if (isUserGesture) setShowSearchArea(true);
  }

  function searchThisArea() {
    setShowSearchArea(false);
    openSearch();
  }

  // Native long-press menu for a place (ActionSheetIOS). NOT @react-native-menu's
  // MenuView: on the New Architecture its wrapper swallows child taps, which
  // silently killed row presses (long-press worked, tap did nothing).
  function showPlaceMenu(place: Place) {
    if (!guide) return;
    const entries: { label: string; destructive?: boolean; action: () => void }[] = [
      { label: 'Open in Apple Maps', action: () => openPlaceInAppleMaps(place) },
      {
        // "Visited" is a personal mark, so every role (viewers included) gets it.
        label: visited[place.id] ? 'Unmark Visited' : 'Mark Visited',
        action: () => {
          Haptics.selectionAsync();
          toggleVisited(place.id);
        },
      },
    ];
    if (canEdit) {
      const targets = layers.filter((l) => l.id !== place.layerId);
      if (targets.length > 0) {
        entries.push({
          label: 'Move to Layer…',
          action: () => showMoveToLayerMenu(place, targets),
        });
      }
      entries.push({
        label: 'Remove from Guide',
        destructive: true,
        action: () => confirmRemove(place),
      });
    }
    const destructiveIndex = entries.findIndex((e) => e.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: place.name,
        options: [...entries.map((e) => e.label), 'Cancel'],
        cancelButtonIndex: entries.length,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => entries[index]?.action(),
    );
  }

  function showMoveToLayerMenu(place: Place, targets: Layer[]) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Move “${place.name}” to`,
        options: [...targets.map((l) => l.name), 'Cancel'],
        cancelButtonIndex: targets.length,
      },
      (index) => {
        const target = targets[index];
        if (target && guide) {
          Haptics.selectionAsync();
          movePlaceToLayer(guide.id, place.id, target.id);
        }
      },
    );
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
      mapRef.current?.setRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        true,
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

  // The sheet rises to its tallest detent while the keyboard is up
  // (keyboardBehavior="extend"), but the list's animated height still runs to
  // the screen bottom BEHIND the keyboard — pad it so every match stays
  // reachable. iOS-only events: on Android these never fire, the height stays
  // 0, and the padding falls back to the safe-area inset as before.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function focusPlace(place: Place) {
    Haptics.selectionAsync();
    sheetRef.current?.snapToIndex(1); // medium — keep the list visible, reveal the map
    // Pan to the pin at the current zoom (gentle) rather than zooming in hard.
    mapRef.current?.setCenter({ latitude: place.latitude, longitude: place.longitude }, true);
  }

  // List row tap: pan AND zoom to street level, so the pin stands alone on the
  // map (far enough in to split out of any cluster). No selection — just show it.
  function goToPlace(place: Place) {
    Haptics.selectionAsync();
    sheetRef.current?.snapToIndex(1);
    mapRef.current?.setRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      true,
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
      if (cam) {
        lat = cam.latitude;
        lng = cam.longitude;
      }
    } catch {
      // Fall back to no map bias; the search screen will try device location.
    }
    router.navigate({
      pathname: '/guide/[id]/search',
      params: {
        id: guide.id,
        ...(lat != null && lng != null ? { lat: String(lat), lng: String(lng) } : {}),
      },
    });
  }

  function openPlaceSearch() {
    Haptics.selectionAsync();
    setSearchOpen(true);
    // Open to the medium detent (not full height) so the field and some results
    // are visible while the map stays in view.
    sheetRef.current?.snapToIndex(1);
  }

  function closePlaceSearch() {
    Keyboard.dismiss();
    sheetRef.current?.snapToIndex(1);
    setSearch('');
    setSearchOpen(false);
  }

  // Search key: drop the keyboard and settle back to the medium detent,
  // keeping the query and its matches on screen.
  function submitPlaceSearch() {
    Keyboard.dismiss();
    sheetRef.current?.snapToIndex(1);
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
        places={mapPlaces}
        layerColors={layerColors}
        layerIcons={layerIcons}
        initialRegion={DEFAULT_REGION}
        onMarkerPress={focusPlace}
        onRegionChange={handleRegionChange}
        onMapReady={() => {
          mapReady.current = true;
          fitToPlaces(false);
        }}
      />

      {/* Floating top bar — Liquid Glass chrome over the map */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <GlassSurface
          interactive
          style={styles.circleBtn}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Pressable onPress={goBack} style={styles.btnInner} hitSlop={8}>
            <Icon name="chevron.left" size={22} color={colors.textPrimary} />
          </Pressable>
        </GlassSurface>
        <GlassSurface
          style={styles.titlePill}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Text style={styles.titleEmoji}>{guide.emoji}</Text>
          <Text
            numberOfLines={1}
            style={[typography.bodyMedium, { color: colors.textPrimary, maxWidth: 180 }]}
          >
            {guide.name}
          </Text>
        </GlassSurface>
        <GlassSurface
          interactive
          style={styles.circleBtn}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Pressable
            onPress={() => router.navigate(`/guide/${guide.id}/settings`)}
            style={styles.btnInner}
            hitSlop={8}
          >
            <Icon name="gearshape" size={20} color={colors.textPrimary} />
          </Pressable>
        </GlassSurface>
      </View>

      {/* "Search this area" pill — appears after the user pans the map */}
      {showSearchArea && (
        <View style={[styles.searchAreaWrap, { top: insets.top + 58 }]} pointerEvents="box-none">
          <GlassSurface
            interactive
            style={styles.searchAreaPill}
            fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
          >
            <Pressable
              onPress={searchThisArea}
              style={({ pressed }) => [styles.searchAreaInner, pressed && { opacity: 0.7 }]}
            >
              <Icon name="magnifyingglass" size={15} color={colors.accent} />
              <Text style={[typography.caption, styles.searchAreaText, { color: colors.accent }]}>
                Search this area
              </Text>
            </Pressable>
          </GlassSurface>
        </View>
      )}

      {/* Floating map controls — ride just above the sheet. Zoom buttons share
          one glass capsule, Apple Maps-style; locate + fit are glass circles. */}
      <Animated.View style={[styles.controlsWrap, { right: spacing.lg }, controlsStyle]}>
        <GlassSurface
          interactive
          style={styles.zoomPill}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Pressable onPress={() => zoomBy(0.5)} style={styles.btnInnerFixed} hitSlop={8}>
            <Icon name="plus" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: colors.border }]} />
          <Pressable onPress={() => zoomBy(2)} style={styles.btnInnerFixed} hitSlop={8}>
            <Icon name="minus" size={24} color={colors.textPrimary} />
          </Pressable>
        </GlassSurface>
        <GlassSurface
          interactive
          style={styles.recenterBtn}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Pressable onPress={locateMe} style={styles.btnInner} hitSlop={8}>
            <Icon name="location" size={22} color={colors.accent} />
          </Pressable>
        </GlassSurface>
        <GlassSurface
          interactive
          style={styles.recenterBtn}
          fallbackStyle={[{ backgroundColor: colors.surface }, styles.fallbackShadow]}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setShowSearchArea(false);
              fitToPlaces(true);
            }}
            disabled={visiblePlaces.length === 0}
            style={styles.btnInner}
            hitSlop={8}
          >
            <Icon
              name="viewfinder"
              size={22}
              color={visiblePlaces.length === 0 ? colors.textTertiary : colors.textPrimary}
            />
          </Pressable>
        </GlassSurface>
      </Animated.View>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        // Rise to the tallest detent while the keyboard is up. Coming back down is
        // ours to do: gorhom's "restore" resolves to detents[currentIndex], which
        // extend has already moved to the top detent, so it restores to no-op.
        keyboardBehavior="extend"
        keyboardBlurBehavior="none"
        animatedPosition={sheetTop}
        style={styles.sheetFloat}
        backgroundComponent={({ style }) => (
          <View style={style} pointerEvents="none">
            {/* Measures the surface's true (taller-than-screen) height. */}
            <View
              style={StyleSheet.absoluteFill}
              onLayout={(e) => {
                surfaceHeight.value = e.nativeEvent.layout.height;
              }}
            />
            <Animated.View style={[styles.sheetGlassWrap, sheetBgStyle]}>
              <GlassSurface
                style={styles.sheetGlass}
                fallbackStyle={{ backgroundColor: colors.surface }}
              />
            </Animated.View>
          </View>
        )}
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
            {places.length > 0 && !searchOpen && (
              <Pressable
                onPress={openPlaceSearch}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={6}
              >
                <Icon name="magnifyingglass" size={20} color={colors.textPrimary} />
              </Pressable>
            )}
            {isOwner && (
              <Pressable
                onPress={() => router.navigate(`/guide/${guide.id}/share`)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={6}
              >
                <Icon name="square.and.arrow.up" size={20} color={colors.textPrimary} />
              </Pressable>
            )}
            {canEdit && (
              <Pressable
                onPress={() => router.navigate(`/guide/${guide.id}/layers`)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={6}
              >
                <Icon name="square.stack.3d.up" size={20} color={colors.textPrimary} />
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
                <Icon name="plus" size={18} color="#fff" />
                <Text style={[typography.bodyMedium, { color: '#fff' }]}>Add</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Height-bound to the card's floating bottom edge; fades out near the
            collapsed snap so only the title row remains in the pill. */}
        <Animated.View style={[styles.clip, belowPillStyle, contentHeightStyle]}>
          {searchOpen && (
            <View style={styles.searchRow}>
              <View style={[styles.searchBox, { backgroundColor: colors.fill }]}>
                <Icon name="magnifyingglass" size={18} color={colors.textTertiary} />
                <BottomSheetTextInput
                  autoFocus
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search this guide"
                  placeholderTextColor={colors.textTertiary}
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={submitPlaceSearch}
                  clearButtonMode="never"
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Icon name="xmark.circle.fill" size={18} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
              <Pressable onPress={closePlaceSearch} hitSlop={8}>
                <Text style={[typography.bodyMedium, { color: colors.accent }]}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {layers.length > 0 && !searchOpen && (
            <View style={styles.toolbar}>
              <Pressable
                onPress={toggleShowAll}
                style={({ pressed }) => [
                  styles.toolBtn,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Icon
                  name={allHidden ? 'eye' : 'eye.slash'}
                  size={15}
                  color={colors.textSecondary}
                />
                <Text
                  style={[typography.caption, styles.toolLabel, { color: colors.textSecondary }]}
                >
                  {allHidden ? 'Show all' : 'Hide all'}
                </Text>
              </Pressable>

              <Pressable
                onPress={toggleCollapseAll}
                style={({ pressed }) => [
                  styles.toolBtn,
                  { backgroundColor: colors.fill },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Icon
                  name={allCollapsed ? 'chevron.down' : 'chevron.up'}
                  size={15}
                  color={colors.textSecondary}
                />
                <Text
                  style={[typography.caption, styles.toolLabel, { color: colors.textSecondary }]}
                >
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
              paddingBottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + spacing.xl,
            }}
            ListEmptyComponent={
              <View style={[styles.sheetEmpty, { height: emptyStateHeight }]}>
                <Icon
                  name={searching ? 'magnifyingglass' : 'mappin'}
                  size={30}
                  color={colors.textTertiary}
                />
                <Text
                  style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}
                >
                  {searching
                    ? `No places match “${search.trim()}”.`
                    : 'Tap “Add” to search for places and drop them on the map.'}
                </Text>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Pressable
                onPress={() => collapseLayer(section.layer)}
                style={({ pressed }) => [styles.layerHeader, pressed && { opacity: 0.6 }]}
              >
                <Icon
                  name={section.layer.collapsed ? 'chevron.right' : 'chevron.down'}
                  size={16}
                  color={colors.textTertiary}
                />
                <View style={[styles.layerBadge, { backgroundColor: section.layer.color + '22' }]}>
                  <LayerIcon name={section.layer.icon} size={15} tintColor={section.layer.color} />
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
                  <Icon
                    name={section.layer.hidden ? 'eye.slash' : 'eye'}
                    size={20}
                    color={section.layer.hidden ? colors.textTertiary : colors.accent}
                  />
                </Pressable>
              </Pressable>
            )}
            renderItem={({ item, section }) => (
              <PlaceRow
                place={item}
                color={section.layer.color}
                onPress={() => goToPlace(item)}
                onLongPress={() => showPlaceMenu(item)}
                onDelete={() => removePlaceFromGuide(guide.id, item.id)}
                readOnly={!canEdit}
                visited={!!visited[item.id]}
              />
            )}
          />
        </Animated.View>
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
    overflow: 'hidden',
  },
  // Centers the icon inside a GlassSurface of any size.
  btnInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // One fixed-height button inside the zoom capsule.
  btnInnerFixed: {
    width: RECENTER_SIZE,
    height: RECENTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pre-Liquid-Glass look: the solid chrome these elements had before.
  fallbackShadow: {
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
    height: 38,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  searchAreaInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  searchAreaText: { fontWeight: '600' },
  recenterBtn: {
    width: RECENTER_SIZE,
    height: RECENTER_SIZE,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  zoomPill: {
    width: RECENTER_SIZE,
    borderRadius: RECENTER_SIZE / 2,
    overflow: 'hidden',
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
  },
  // Floating glass panel, inset from the screen edges at every detent. The
  // radius + clip here round the content's TOP corners (the surface's bottom
  // corners live below the screen, so the content wrapper rounds those).
  sheetFloat: {
    marginHorizontal: spacing.sm,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  clip: {
    overflow: 'hidden',
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  // The card's glass background. Corner radius is concentric with the device:
  // roughly the display's corner radius minus the 8pt margin, so the card's
  // curves run parallel to the screen corners (Apple's floating-sheet look).
  sheetGlassWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  sheetGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0, letterSpacing: 0 }, // letterSpacing guards vs RN#42589
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
});

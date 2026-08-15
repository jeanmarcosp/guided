import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import Animated, { SlideInDown } from 'react-native-reanimated';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import ColorPicker from 'react-native-wheel-color-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LAYER_COLORS, LAYER_EMOJIS } from '@/lib/layers';
import type { Layer } from '@/lib/types';
import { useGuides } from '@/store/guides';
import { radius, spacing, typography, useColors } from '@/theme/tokens';

/** Returns black or white — whichever is readable on the given hex color. */
function contrastOn(hex: string): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#FFFFFF';
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#FFFFFF';
}

export default function ManageLayers() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const guide = useGuides((s) => s.guides.find((g) => g.id === id));
  const addLayer = useGuides((s) => s.addLayer);
  const updateLayer = useGuides((s) => s.updateLayer);
  const deleteLayer = useGuides((s) => s.deleteLayer);
  const moveLayerIndex = useGuides((s) => s.moveLayerIndex);

  const [editingId, setEditingId] = useState<string | null>(null);

  const layers = guide?.layers ?? [];
  const editingLayer = layers.find((l) => l.id === editingId) ?? null;

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of guide?.places ?? []) m[p.layerId ?? ''] = (m[p.layerId ?? ''] ?? 0) + 1;
    return m;
  }, [guide?.places]);

  if (!guide) return null;

  function confirmDelete(layer: Layer) {
    const n = counts[layer.id] ?? 0;
    Alert.alert(
      `Delete “${layer.name}”?`,
      n > 0 ? `Its ${n} place${n === 1 ? '' : 's'} will move to another layer.` : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteLayer(guide!.id, layer.id);
            setEditingId(null);
          },
        },
      ],
    );
  }

  function handleAdd() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const layer = addLayer(guide!.id, 'New Layer');
    if (layer) setEditingId(layer.id); // open the editor so they can name/style it
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[typography.title, { color: colors.textPrimary }]}>Layers</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[typography.bodyMedium, { color: colors.accent }]}>Done</Text>
        </Pressable>
      </View>

      <ReorderableList
        style={styles.fill}
        data={layers}
        keyExtractor={(l) => l.id}
        onReorder={({ from, to }: ReorderableListReorderEvent) => {
          Haptics.selectionAsync();
          moveLayerIndex(guide.id, from, to);
        }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={[typography.body, styles.emptyText, { color: colors.textSecondary }]}>
            No layers yet. Add one below, or add places and layers appear automatically.
          </Text>
        }
        ListFooterComponent={
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: colors.border },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="add" size={20} color={colors.accent} />
            <Text style={[typography.bodyMedium, { color: colors.accent }]}>Add Layer</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <LayerRow
            layer={item}
            count={counts[item.id] ?? 0}
            onEdit={() => setEditingId(item.id)}
          />
        )}
      />

      <LayerEditor
        layer={editingLayer}
        onSave={(patch) => editingLayer && updateLayer(guide.id, editingLayer.id, patch)}
        onDelete={() => editingLayer && confirmDelete(editingLayer)}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}

type LayerRowProps = { layer: Layer; count: number; onEdit: () => void };

function LayerRow({ layer, count, onEdit }: LayerRowProps) {
  const colors = useColors();
  const drag = useReorderableDrag(); // press-and-hold to start dragging

  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={200}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Pressable onLongPress={drag} delayLongPress={120} hitSlop={8} style={styles.grip}>
        <Ionicons name="reorder-three" size={24} color={colors.textTertiary} />
      </Pressable>

      <View style={[styles.badge, { backgroundColor: layer.color + '22' }]}>
        <Text style={styles.badgeEmoji}>{layer.emoji}</Text>
      </View>

      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[typography.bodyMedium, { color: colors.textPrimary }]}>
          {layer.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textTertiary }]}>
          {count} place{count === 1 ? '' : 's'}
        </Text>
      </View>

      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [
          styles.editBtn,
          { backgroundColor: colors.surfaceAlt },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={[typography.caption, { color: colors.accent, fontWeight: '600' }]}>Edit</Text>
      </Pressable>
    </Pressable>
  );
}

type LayerEditorProps = {
  layer: Layer | null;
  onSave: (patch: { name: string; color: string; emoji: string }) => void;
  onDelete: () => void;
  onClose: () => void;
};

function LayerEditor({ layer, onSave, onDelete, onClose }: LayerEditorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [color, setColor] = useState(LAYER_COLORS[0]);
  const [emoji, setEmoji] = useState('📍');
  const [showWheel, setShowWheel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Load the draft whenever a different layer opens.
  useEffect(() => {
    if (layer) {
      setName(layer.name);
      setColor(layer.color);
      setEmoji(layer.emoji);
      setShowWheel(false);
    }
  }, [layer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCustomEmoji(picked: EmojiType) {
    setEmoji(picked.emoji);
    setShowEmojiPicker(false);
  }

  function done() {
    if (layer) onSave({ name, color, emoji });
    onClose();
  }

  // True when the current color isn't one of the presets → the custom swatch
  // shows that color (selected, like a preset) instead of the palette icon.
  const isCustomColor = !LAYER_COLORS.includes(color);

  // True when the picked emoji isn't one of the presets → show it as an extra
  // selected chip in the row (outlined in the layer color, like the presets).
  const isCustomEmoji = !!emoji && !LAYER_EMOJIS.includes(emoji);

  return (
    <Modal visible={!!layer} transparent animationType="fade" onRequestClose={done}>
      <Pressable style={styles.backdrop} onPress={done} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          entering={SlideInDown.duration(280)}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View style={styles.sheetTop}>
            <Text style={[typography.heading, { color: colors.textPrimary }]}>Edit Layer</Text>
            <Pressable onPress={done} hitSlop={8}>
              <Text style={[typography.bodyMedium, { color: colors.accent }]}>Done</Text>
            </Pressable>
          </View>

          {/* Preview + name */}
          <View style={styles.previewRow}>
            <View style={[styles.previewBadge, { backgroundColor: color + '22' }]}>
              <Text style={styles.previewEmoji}>{emoji}</Text>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Layer name"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.nameInput,
                { color: colors.textPrimary, backgroundColor: colors.surfaceAlt },
              ]}
            />
          </View>

          <Text style={[typography.caption, styles.label, { color: colors.textSecondary }]}>
            COLOR
          </Text>
          <View style={styles.swatchRow}>
            {LAYER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setColor(c);
                  setShowWheel(false);
                }}
                style={[
                  styles.color,
                  { backgroundColor: c },
                  color === c && !showWheel && { borderWidth: 3, borderColor: colors.textPrimary },
                ]}
              />
            ))}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowWheel((s) => !s);
              }}
              style={
                isCustomColor
                  ? [
                      styles.color,
                      { backgroundColor: color, borderWidth: 3, borderColor: colors.textPrimary },
                    ]
                  : [
                      styles.color,
                      styles.customColor,
                      { borderColor: showWheel ? colors.accent : colors.border },
                    ]
              }
            >
              <Ionicons
                name="color-palette-outline"
                size={16}
                color={isCustomColor ? contrastOn(color) : colors.textSecondary}
              />
            </Pressable>
          </View>

          {showWheel && (
            <View style={styles.wheelWrap}>
              <View style={styles.wheelPicker}>
                <ColorPicker
                  color={color}
                  onColorChange={(c) => setColor(c)}
                  onColorChangeComplete={(c) => setColor(c)}
                  thumbSize={28}
                  sliderSize={26}
                  noSnap
                  row={false}
                  swatches={false}
                />
              </View>
              <Pressable
                onPress={() => setShowWheel(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.wheelDone, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="checkmark" size={18} color={colors.accent} />
                <Text style={[typography.bodyMedium, { color: colors.accent }]}>Done</Text>
              </Pressable>
            </View>
          )}

          <Text style={[typography.caption, styles.label, { color: colors.textSecondary }]}>
            ICON
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiRow}
          >
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowEmojiPicker(true);
              }}
              style={[styles.emojiBtn, styles.customEmojiBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="add" size={20} color={colors.textSecondary} />
            </Pressable>
            {isCustomEmoji && (
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowEmojiPicker(true);
                }}
                style={[
                  styles.emojiBtn,
                  { backgroundColor: color + '33', borderColor: color, borderWidth: 2 },
                ]}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            )}
            {LAYER_EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={[
                  styles.emojiBtn,
                  { backgroundColor: colors.surfaceAlt },
                  emoji === e && {
                    backgroundColor: color + '33',
                    borderColor: color,
                    borderWidth: 2,
                  },
                ]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* In-app emoji picker — opens straight to emojis so the user can
              pick ANY emoji without hunting for the 🌐 key. */}
          <EmojiPicker
            open={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onEmojiSelected={handleCustomEmoji}
            enableSearchBar
            theme={{
              backdrop: '#00000080',
              knob: colors.handle,
              container: colors.surface,
              header: colors.textSecondary,
              skinTonesContainer: colors.surfaceAlt,
              category: {
                icon: colors.textSecondary,
                iconActive: contrastOn(colors.accent),
                container: colors.surfaceAlt,
                containerActive: colors.accent,
              },
              search: {
                text: colors.textPrimary,
                placeholder: colors.textTertiary,
                icon: colors.textSecondary,
                background: colors.surfaceAlt,
              },
              emoji: {
                selected: colors.surfaceAlt,
              },
            }}
          />

          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={[typography.bodyMedium, { color: colors.danger }]}>Delete Layer</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  emptyText: { textAlign: 'center', paddingVertical: spacing.xl },

  // Minimal layer row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  grip: { paddingRight: spacing.xs },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: { fontSize: 20 },
  rowBody: { flex: 1, gap: 1 },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    marginLeft: spacing.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },

  // Editor modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: { fontSize: 26 },
  nameInput: {
    flex: 1,
    height: 46,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    letterSpacing: 0, // guards placeholder against RN#42589 letterSpacing bleed
  },
  label: { letterSpacing: 0.5, marginTop: spacing.xs },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  color: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customColor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  wheelWrap: { marginTop: spacing.md, gap: spacing.sm },
  wheelPicker: { height: 240 },
  wheelDone: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  emojiRow: { gap: spacing.sm, paddingVertical: 2 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  customEmojiBtn: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
});

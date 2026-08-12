import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NestedReorderableList,
  ScrollViewContainer,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GuideCard from '@/components/GuideCard';
import GuideEditor, { type GuideDraft } from '@/components/GuideEditor';
import SwipeActionRow, { type SwipeAction } from '@/components/SwipeActionRow';
import type { Guide } from '@/lib/types';
import { useGuides } from '@/store/guides';
import { useSettings, type ThemeMode } from '@/store/settings';
import { GUIDE_COLORS, GUIDE_EMOJIS, radius, spacing, typography, useColors } from '@/theme/tokens';

type EditorState = { mode: 'create'; draft: GuideDraft } | { mode: 'edit'; id: string; draft: GuideDraft };
type Row = { type: 'header'; label: string } | { type: 'guide'; guide: Guide };

export default function GuidesHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const guides = useGuides((s) => s.guides);
  const createGuide = useGuides((s) => s.createGuide);
  const updateGuide = useGuides((s) => s.updateGuide);
  const deleteGuide = useGuides((s) => s.deleteGuide);
  const togglePinGuide = useGuides((s) => s.togglePinGuide);
  const setGuidesOrder = useGuides((s) => s.setGuidesOrder);
  const themeMode = useSettings((s) => s.themeMode);
  const setThemeMode = useSettings((s) => s.setThemeMode);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [reordering, setReordering] = useState(false);
  const editingGuide = editor?.mode === 'edit' ? guides.find((g) => g.id === editor.id) : undefined;

  const pinnedList = useMemo(() => guides.filter((g) => g.pinned), [guides]);
  const restList = useMemo(() => guides.filter((g) => !g.pinned), [guides]);

  // Flat rows (with interleaved section headers) for the normal, swipeable list.
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    const hasPins = pinnedList.length > 0;
    if (hasPins) {
      r.push({ type: 'header', label: 'PINNED' });
      pinnedList.forEach((g) => r.push({ type: 'guide', guide: g }));
    }
    if (restList.length > 0) {
      if (hasPins) r.push({ type: 'header', label: 'ALL GUIDES' });
      restList.forEach((g) => r.push({ type: 'guide', guide: g }));
    }
    return r;
  }, [pinnedList, restList]);

  const stickyIndices = useMemo(
    () => rows.map((row, i) => (row.type === 'header' ? i : -1)).filter((i) => i >= 0),
    [rows]
  );

  function chooseAppearance() {
    const modes: { key: ThemeMode; label: string }[] = [
      { key: 'system', label: 'System' },
      { key: 'light', label: 'Light' },
      { key: 'dark', label: 'Dark' },
    ];
    const options = [...modes.map((m) => (m.key === themeMode ? `✓  ${m.label}` : m.label)), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Appearance', options, cancelButtonIndex: options.length - 1 },
      (i) => {
        if (i < modes.length) {
          Haptics.selectionAsync();
          setThemeMode(modes[i].key);
        }
      }
    );
  }

  function handleCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const seed = guides.length;
    setEditor({
      mode: 'create',
      draft: {
        name: '',
        color: GUIDE_COLORS[seed % GUIDE_COLORS.length],
        emoji: GUIDE_EMOJIS[seed % GUIDE_EMOJIS.length],
      },
    });
  }

  function handleEdit(guide: Guide) {
    setEditor({
      mode: 'edit',
      id: guide.id,
      draft: { name: guide.name, color: guide.color, emoji: guide.emoji },
    });
  }

  function handleSubmit(draft: GuideDraft) {
    if (!editor) return;
    if (editor.mode === 'create') {
      const guide = createGuide(draft.name || 'Untitled Guide', draft.emoji, draft.color);
      setEditor(null);
      router.push(`/guide/${guide.id}`);
    } else {
      updateGuide(editor.id, draft);
      setEditor(null);
    }
  }

  function handleDelete() {
    if (editor?.mode !== 'edit') return;
    const id = editor.id;
    Alert.alert('Delete guide?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteGuide(id);
          setEditor(null);
        },
      },
    ]);
  }

  function confirmDeleteGuide(guide: Guide) {
    Alert.alert('Delete guide?', `Delete “${guide.name}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteGuide(guide.id) },
    ]);
  }

  const swipeActions = (guide: Guide): SwipeAction[] => [
    {
      key: 'pin',
      icon: (
        <MaterialCommunityIcons name={guide.pinned ? 'pin-off' : 'pin'} size={20} color="#fff" />
      ),
      color: '#FF9500',
      onPress: () => {
        Haptics.selectionAsync();
        togglePinGuide(guide.id);
      },
    },
    {
      key: 'delete',
      icon: <Ionicons name="trash" size={20} color="#fff" />,
      color: colors.danger,
      onPress: () => confirmDeleteGuide(guide),
    },
  ];

  function reorderGroup(group: Guide[], from: number, to: number): Guide[] {
    const arr = [...group];
    const [moved] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(to, arr.length)), 0, moved);
    return arr;
  }

  function reorderPinned({ from, to }: ReorderableListReorderEvent) {
    Haptics.selectionAsync();
    const pinned = reorderGroup(pinnedList, from, to);
    setGuidesOrder([...pinned.map((g) => g.id), ...restList.map((g) => g.id)]);
  }

  function reorderRest({ from, to }: ReorderableListReorderEvent) {
    Haptics.selectionAsync();
    const rest = reorderGroup(restList, from, to);
    setGuidesOrder([...pinnedList.map((g) => g.id), ...rest.map((g) => g.id)]);
  }

  // Normal (swipeable) list item.
  const renderNormalItem = ({ item }: { item: Row }) => {
    if (item.type === 'header') return <SectionHeader label={item.label} />;
    const g = item.guide;
    return (
      <View style={styles.guideSpacer}>
        <SwipeActionRow
          actions={swipeActions(g)}
          onPress={() => router.push(`/guide/${g.id}`)}
          onLongPress={() => handleEdit(g)}
        >
          <GuideCard guide={g} />
        </SwipeActionRow>
      </View>
    );
  };

  // Reorder-mode row (grip drag, no swipe).
  const renderDragRow = ({ item }: { item: Guide }) => (
    <GuideDragRow guide={item} onPress={() => router.push(`/guide/${item.id}`)} />
  );

  // Reorder mode: one nested list per group inside a sticky-header scroll view.
  const reorderChildren: ReactNode[] = [];
  const reorderSticky: number[] = [];
  if (pinnedList.length > 0) {
    reorderSticky.push(reorderChildren.length);
    reorderChildren.push(<SectionHeader key="h-pinned" label="PINNED" />);
    reorderChildren.push(
      <NestedReorderableList
        key="list-pinned"
        data={pinnedList}
        scrollable={false}
        keyExtractor={(g) => g.id}
        onReorder={reorderPinned}
        renderItem={renderDragRow}
      />
    );
  }
  if (restList.length > 0) {
    if (pinnedList.length > 0) {
      reorderSticky.push(reorderChildren.length);
      reorderChildren.push(<SectionHeader key="h-all" label="ALL GUIDES" />);
    }
    reorderChildren.push(
      <NestedReorderableList
        key="list-rest"
        data={restList}
        scrollable={false}
        keyExtractor={(g) => g.id}
        onReorder={reorderRest}
        renderItem={renderDragRow}
      />
    );
  }

  const contentStyle = { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>
          {reordering ? 'Reorder' : 'Guides'}
        </Text>
        <View style={styles.headerActions}>
          {reordering ? (
            <Pressable onPress={() => setReordering(false)} hitSlop={8} style={styles.doneBtn}>
              <Text style={[typography.bodyMedium, { color: colors.accent }]}>Done</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={chooseAppearance}
                style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <Ionicons name="contrast-outline" size={20} color={colors.textPrimary} />
              </Pressable>
              {guides.length > 1 && (
                <Pressable
                  onPress={() => setReordering(true)}
                  style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                  hitSlop={8}
                >
                  <Ionicons name="swap-vertical" size={20} color={colors.textPrimary} />
                </Pressable>
              )}
              <Pressable
                onPress={handleCreate}
                style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.7 }]}
                hitSlop={8}
              >
                <Ionicons name="add" size={26} color="#fff" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {guides.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="map-outline" size={34} color={colors.textTertiary} />
          </View>
          <Text style={[typography.heading, { color: colors.textPrimary }]}>No guides yet</Text>
          <Text style={[typography.body, styles.emptyText, { color: colors.textSecondary }]}>
            Create a guide to start collecting places on the map.
          </Text>
          <Pressable
            onPress={handleCreate}
            style={({ pressed }) => [styles.cta, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={[typography.bodyMedium, { color: '#fff' }]}>Create your first guide</Text>
          </Pressable>
        </View>
      ) : reordering ? (
        <ScrollViewContainer
          style={styles.container}
          stickyHeaderIndices={reorderSticky}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {reorderChildren}
        </ScrollViewContainer>
      ) : (
        <FlatList
          style={styles.container}
          data={rows}
          keyExtractor={(row) => (row.type === 'header' ? `h-${row.label}` : row.guide.id)}
          stickyHeaderIndices={stickyIndices}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          renderItem={renderNormalItem}
        />
      )}

      <GuideEditor
        visible={!!editor}
        mode={editor?.mode ?? 'create'}
        initial={editor?.draft ?? { name: '', color: GUIDE_COLORS[0], emoji: GUIDE_EMOJIS[0] }}
        pinned={editingGuide?.pinned}
        onTogglePin={editor?.mode === 'edit' ? () => togglePinGuide(editor.id) : undefined}
        onSubmit={handleSubmit}
        onDelete={editor?.mode === 'edit' ? handleDelete : undefined}
        onClose={() => setEditor(null)}
      />
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.stickyHeader, { backgroundColor: colors.background }]}>
      <Text style={[typography.caption, styles.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

function GuideDragRow({ guide, onPress }: { guide: Guide; onPress: () => void }) {
  const colors = useColors();
  const drag = useReorderableDrag();

  return (
    <View style={styles.rowWrap}>
      <Pressable onLongPress={drag} delayLongPress={150} hitSlop={8} style={styles.grip}>
        <Ionicons name="reorder-three" size={24} color={colors.textTertiary} />
      </Pressable>
      <Pressable style={styles.rowCard} onPress={onPress}>
        <GuideCard guide={guide} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doneBtn: { paddingHorizontal: spacing.sm, height: 40, justifyContent: 'center' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyHeader: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  sectionLabel: { fontWeight: '700', letterSpacing: 0.6 },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  grip: { paddingHorizontal: 2 },
  rowCard: { flex: 1 },
  guideSpacer: { marginBottom: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.md },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  emptyText: { textAlign: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
});

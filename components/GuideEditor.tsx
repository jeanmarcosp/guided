import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
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
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUIDE_COLORS, GUIDE_EMOJIS, radius, spacing, typography, useColors } from '@/theme/tokens';

export type GuideDraft = { name: string; color: string; emoji: string };

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: GuideDraft;
  pinned?: boolean;
  onTogglePin?: () => void;
  onSubmit: (draft: GuideDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export default function GuideEditor({
  visible,
  mode,
  initial,
  pinned,
  onTogglePin,
  onSubmit,
  onDelete,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [color, setColor] = useState(GUIDE_COLORS[0]);
  const [emoji, setEmoji] = useState(GUIDE_EMOJIS[0]);

  // Seed the draft each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setName(initial.name);
      setColor(initial.color);
      setEmoji(initial.emoji);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit() {
    onSubmit({ name, color, emoji });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          entering={SlideInDown.duration(280)}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View style={styles.top}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.heading, { color: colors.textPrimary }]}>
              {mode === 'create' ? 'New Guide' : 'Edit Guide'}
            </Text>
            <Pressable onPress={submit} hitSlop={8}>
              <Text style={[typography.bodyMedium, { color: colors.accent }]}>
                {mode === 'create' ? 'Create' : 'Save'}
              </Text>
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
              placeholder="Guide name"
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
            {GUIDE_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.color,
                  { backgroundColor: c },
                  color === c && { borderWidth: 3, borderColor: colors.textPrimary },
                ]}
              />
            ))}
          </View>

          <Text style={[typography.caption, styles.label, { color: colors.textSecondary }]}>
            ICON
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiRow}
          >
            {GUIDE_EMOJIS.map((e) => (
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

          {mode === 'edit' && onTogglePin && (
            <Pressable
              onPress={onTogglePin}
              style={({ pressed }) => [
                styles.pinRow,
                { backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons
                name={pinned ? 'pin-off' : 'pin'}
                size={18}
                color={pinned ? colors.accent : colors.textSecondary}
              />
              <Text style={[typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                {pinned ? 'Pinned to top' : 'Pin to top'}
              </Text>
              {pinned && <Ionicons name="checkmark" size={18} color={colors.accent} />}
            </Pressable>
          )}

          {mode === 'edit' && onDelete && (
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[typography.bodyMedium, { color: colors.danger }]}>Delete Guide</Text>
            </Pressable>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  color: { width: 34, height: 34, borderRadius: radius.pill },
  emojiRow: { gap: spacing.sm, paddingVertical: 2 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
});

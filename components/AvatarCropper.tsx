import * as ImageManipulator from 'expo-image-manipulator';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, useColors } from '@/theme/tokens';

const MAX_ZOOM = 5;
const OUTPUT = 512; // final square avatar size, in px

type Props = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
  /** Base64 JPEG of the circular-framed (square) crop, ready to upload. */
  onDone: (base64: string) => void;
};

/**
 * Full-screen circular cropper. The image is scaled so its shorter side fills the
 * crop circle at zoom 1 (so the circle is always covered), then the user pans and
 * pinches within it. On confirm we map the circle's bounding square back to source
 * pixels and crop there — the result is square (displayed round by <Avatar>).
 */
export default function AvatarCropper({ uri, imageWidth, imageHeight, onCancel, onDone }: Props) {
  const colors = useColors();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const D = Math.min(screenW, screenH) * 0.8; // crop-circle diameter (screen px)
  const cx = screenW / 2;
  const cy = screenH / 2;
  // Zoom-1 fit: shorter image side == D, so the circle is fully covered.
  const baseScale = D / Math.min(imageWidth, imageHeight);
  const bw = imageWidth * baseScale;
  const bh = imageHeight * baseScale;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Keep the image covering the circle: clamp pan to the slack on each axis.
  const clampTranslate = () => {
    'worklet';
    const s = baseScale * scale.value;
    const maxX = Math.max(0, (imageWidth * s - D) / 2);
    const maxY = Math.max(0, (imageHeight * s - D) / 2);
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
      clampTranslate();
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
      clampTranslate();
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      // Screen crop square (D, centered) → source pixels. s maps image px → screen px.
      const s = baseScale * scale.value;
      const size = D / s;
      const originX = Math.max(
        0,
        Math.min(imageWidth / 2 - (D / 2 + tx.value) / s, imageWidth - size),
      );
      const originY = Math.max(
        0,
        Math.min(imageHeight / 2 - (D / 2 + ty.value) / s, imageHeight - size),
      );
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: OUTPUT, height: OUTPUT } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (result.base64) onDone(result.base64);
      else throw new Error('No image data');
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Could not crop photo', e?.message ?? 'Please try again.');
    }
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.Image
            source={{ uri }}
            style={[
              { position: 'absolute', width: bw, height: bh, left: cx - bw / 2, top: cy - bh / 2 },
              imgStyle,
            ]}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
          <View
            pointerEvents="none"
            style={[
              styles.ring,
              { left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: D / 2 },
            ]}
          />
        </View>
      </GestureDetector>

      <Text style={[styles.hint, { top: insets.top + spacing.xl }]}>Move and zoom</Text>

      <View style={[styles.actions, { bottom: insets.bottom + spacing.xl }]}>
        <Pressable onPress={onCancel} disabled={busy} hitSlop={8} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={confirm}
          disabled={busy}
          style={[styles.useBtn, { backgroundColor: colors.accent }, busy && { opacity: 0.7 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.useText}>Use Photo</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', zIndex: 10 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: '#fff' },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#fff',
    ...typography.bodyMedium,
  },
  actions: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelText: { color: '#fff', ...typography.body },
  useBtn: {
    minWidth: 120,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  useText: { color: '#fff', ...typography.bodyMedium },
});

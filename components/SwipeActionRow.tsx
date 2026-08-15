import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { spacing } from '@/theme/tokens';

export type SwipeAction = {
  key: string;
  /** Rendered icon element (white, ~20px). */
  icon: ReactNode;
  color: string;
  onPress: () => void;
};

const BUBBLE = 44;
const GAP = spacing.sm;

// Only one row stays open at a time across all SwipeActionRows.
let openRow: SwipeableMethods | null = null;

type Props = {
  children: ReactNode;
  actions: SwipeAction[];
  onPress: () => void;
  onLongPress?: () => void;
};

export default function SwipeActionRow({ children, actions, onPress, onLongPress }: Props) {
  const ref = useRef<SwipeableMethods>(null);
  const isOpen = useRef(false);
  const revealWidth = actions.length * BUBBLE + (actions.length + 1) * GAP;

  function renderRightActions(
    _progress: unknown,
    _translation: unknown,
    methods: SwipeableMethods,
  ) {
    return (
      <View style={[styles.actions, { width: revealWidth }]}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => {
              methods.close();
              a.onPress();
            }}
            style={({ pressed }) => [
              styles.bubble,
              { backgroundColor: a.color },
              pressed && { opacity: 0.7 },
            ]}
          >
            {a.icon}
          </Pressable>
        ))}
      </View>
    );
  }

  function handlePress() {
    if (isOpen.current) ref.current?.close();
    else onPress();
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1}
      rightThreshold={revealWidth * 0.25}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
        isOpen.current = true;
      }}
      onSwipeableWillClose={() => {
        isOpen.current = false;
        if (openRow === ref.current) openRow = null;
      }}
    >
      <Pressable onPress={handlePress} onLongPress={() => !isOpen.current && onLongPress?.()}>
        {children}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: GAP,
    paddingHorizontal: GAP,
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

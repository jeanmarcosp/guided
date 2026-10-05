import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';

/** True on iOS 26+ built with Xcode 26 — the only place that renders glass. */
export const glassAvailable = isLiquidGlassAvailable();

type Props = ViewProps & {
  /** Native touch shimmer on the glass (mount-time only, per expo-glass-effect). */
  interactive?: boolean;
  /**
   * Styling applied ONLY when Liquid Glass is unavailable — typically the
   * pre-glass solid background + shadow, so older iOS looks unchanged.
   */
  fallbackStyle?: StyleProp<ViewStyle>;
};

/**
 * A Liquid Glass surface with a graceful pre-iOS-26 fallback. Pass geometry
 * (size/radius/layout) in `style`; pass the solid background + shadow the
 * element used to have in `fallbackStyle`.
 */
export default function GlassSurface({ interactive, fallbackStyle, style, ...rest }: Props) {
  if (glassAvailable) {
    return <GlassView isInteractive={interactive} style={style} {...rest} />;
  }
  return <View style={[style, fallbackStyle]} {...rest} />;
}

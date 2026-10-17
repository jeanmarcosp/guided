import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

export type IconName = SymbolViewProps['name'];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * App-wide icon: a native SF Symbol (expo-symbols), same family the map pins
 * and layer badges use. Props mirror the old @expo/vector-icons surface
 * (name/size/color) so call sites read the same.
 */
export default function Icon({ name, size = 20, color, style }: Props) {
  return <SymbolView name={name} size={size} tintColor={color} style={style} />;
}

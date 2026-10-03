import { SymbolView, type SymbolViewProps } from 'expo-symbols';

type Props = {
  /** SF Symbol name (Layer.icon). */
  name: string;
  size?: number;
  tintColor?: string;
};

/**
 * A layer's SF Symbol, rendered natively. Layer.icon is a plain string in the
 * data model (it round-trips through Supabase), so the SFSymbol cast lives
 * here instead of at every call site.
 */
export default function LayerIcon({ name, size = 20, tintColor }: Props) {
  return <SymbolView name={name as SymbolViewProps['name']} size={size} tintColor={tintColor} />;
}

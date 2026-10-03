import { requireNativeView } from 'expo';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import type { EdgePadding, GuidedMapRef, MapAnnotation, Region, RegionChangeEvent } from './types';

export type GuidedMapViewProps = {
  style?: StyleProp<ViewStyle>;
  annotations: MapAnnotation[];
  initialRegion?: Region;
  showsUserLocation?: boolean;
  /** Insets for the native cluster-tap zoom (clears the bottom sheet). */
  clusterFitPadding?: EdgePadding;
  onMapReady?: () => void;
  onRegionChange?: (event: RegionChangeEvent) => void;
  onMarkerPress?: (id: string) => void;
  /** The callout's open button was tapped. */
  onCalloutAccessoryPress?: (id: string) => void;
};

type NativeProps = Omit<
  GuidedMapViewProps,
  'onRegionChange' | 'onMarkerPress' | 'onCalloutAccessoryPress'
> & {
  ref?: React.Ref<GuidedMapRef>;
  onRegionChange?: (event: { nativeEvent: RegionChangeEvent }) => void;
  onMarkerPress?: (event: { nativeEvent: { id: string } }) => void;
  onCalloutAccessoryPress?: (event: { nativeEvent: { id: string } }) => void;
};

// The native module is Apple-only; requireNativeView would throw where it
// isn't linked, so resolve it lazily per platform.
const NativeGuidedMapView =
  Platform.OS === 'ios' ? requireNativeView<NativeProps>('GuidedMap') : null;

/**
 * Native Apple map with built-in pin clustering (MKClusterAnnotation).
 * Annotations are data props managed natively — the view has no React
 * children. The ref exposes the camera commands (view functions declared in
 * GuidedMapModule.swift surface directly on the native component's ref).
 */
const GuidedMapView = forwardRef<GuidedMapRef, GuidedMapViewProps>(function GuidedMapView(
  { onRegionChange, onMarkerPress, onCalloutAccessoryPress, ...rest },
  ref,
) {
  const nativeRef = useRef<GuidedMapRef>(null);

  useImperativeHandle(ref, () => ({
    setRegion: (region, animated) =>
      nativeRef.current?.setRegion(region, animated) ?? Promise.resolve(),
    setCenter: (center, animated) =>
      nativeRef.current?.setCenter(center, animated) ?? Promise.resolve(),
    fitToCoordinates: (coordinates, padding, animated) =>
      nativeRef.current?.fitToCoordinates(coordinates, padding, animated) ?? Promise.resolve(),
    getCamera: () =>
      nativeRef.current?.getCamera() ?? Promise.reject(new Error('Map is not mounted')),
    zoomBy: (factor) => nativeRef.current?.zoomBy(factor) ?? Promise.resolve(),
  }));

  if (!NativeGuidedMapView) {
    // Non-Apple platforms: the app is Apple Maps-only today.
    return <View style={rest.style} />;
  }

  return (
    <NativeGuidedMapView
      ref={nativeRef}
      {...rest}
      onRegionChange={onRegionChange ? (event) => onRegionChange(event.nativeEvent) : undefined}
      onMarkerPress={onMarkerPress ? (event) => onMarkerPress(event.nativeEvent.id) : undefined}
      onCalloutAccessoryPress={
        onCalloutAccessoryPress
          ? (event) => onCalloutAccessoryPress(event.nativeEvent.id)
          : undefined
      }
    />
  );
});

export default GuidedMapView;

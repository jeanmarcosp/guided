export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LatLng = { latitude: number; longitude: number };

export type EdgePadding = { top: number; left: number; right: number; bottom: number };

/** One place, serialized for the native map. Pins cluster natively (MapKit). */
export type MapAnnotation = {
  id: string;
  latitude: number;
  longitude: number;
  /** Shown by the native callout. */
  title: string;
  /** SF Symbol name, drawn as the marker's native glyph. */
  icon: string;
  /** Pin/bubble fill, "#RRGGBB". */
  color: string;
  /** Groups members for the cluster bubble's dominant-layer tint. */
  layerId: string;
};

export type RegionChangeEvent = Region & {
  /** True when the user's pan/pinch caused the move, false for app-driven camera moves. */
  isUserGesture: boolean;
};

export type Camera = { latitude: number; longitude: number; altitude: number };

/** Imperative camera API, exposed on the GuidedMapView ref. */
export type GuidedMapRef = {
  setRegion(region: Region, animated: boolean): Promise<void>;
  /** Pan to a coordinate without changing zoom. */
  setCenter(center: LatLng, animated: boolean): Promise<void>;
  fitToCoordinates(coordinates: LatLng[], padding: EdgePadding, animated: boolean): Promise<void>;
  getCamera(): Promise<Camera>;
  /** Step the zoom: factor 0.5 zooms in, 2 zooms out. */
  zoomBy(factor: number): Promise<void>;
};

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

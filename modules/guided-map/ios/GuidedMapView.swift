import ExpoModulesCore
import MapKit

/// Hosts a raw MKMapView. Annotations arrive as serialized props and are
/// diffed into the map natively — never as React children — so MapKit owns
/// clustering, collision, selection, and callouts end to end. (The previous
/// react-native-maps setup needed a fixed marker pool, off-screen parking and
/// an app-drawn callout to survive the New Architecture; none of that applies
/// here.)
class GuidedMapView: ExpoView, MKMapViewDelegate {
  let mapView = MKMapView()

  let onMapReady = EventDispatcher()
  let onRegionChange = EventDispatcher()
  let onMarkerPress = EventDispatcher()
  let onCalloutAccessoryPress = EventDispatcher()

  /// Staged by the `annotations` prop; applied once per update batch in
  /// OnViewDidUpdateProps so a render never half-applies.
  var pendingAnnotations: [MapAnnotationRecord]?
  /// Insets for the cluster-tap zoom, so members frame above the bottom sheet.
  var clusterFitPadding: UIEdgeInsets = .zero

  private var annotationsById: [String: PlaceAnnotation] = [:]
  private var regionChangeIsFromGesture = false
  private var hasEmittedReady = false
  private var hasSetInitialRegion = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    mapView.delegate = self
    mapView.showsUserLocation = true
    mapView.showsCompass = false
    mapView.pointOfInterestFilter = .excludingAll
    mapView.register(
      PlacePinView.self,
      forAnnotationViewWithReuseIdentifier: PlacePinView.reuseID
    )
    mapView.register(
      ClusterMarkerView.self,
      forAnnotationViewWithReuseIdentifier: ClusterMarkerView.reuseID
    )
    addSubview(mapView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    mapView.frame = bounds
    // "Ready" once the map has real bounds, so fit math on the JS side is
    // valid from the first callback.
    if !hasEmittedReady, bounds.width > 0, bounds.height > 0 {
      hasEmittedReady = true
      onMapReady([:])
    }
  }

  func setInitialRegionOnce(_ region: MKCoordinateRegion?) {
    guard !hasSetInitialRegion, let region else { return }
    hasSetInitialRegion = true
    mapView.setRegion(region, animated: false)
  }

  // MARK: - Annotation diffing

  /// Keyed by place id. Unchanged places keep the exact same annotation
  /// object (stable identity keeps native cluster animations smooth); any
  /// field change replaces the annotation, which is also what forces MapKit
  /// to re-cluster and re-render it.
  func applyAnnotationDiff() {
    guard let records = pendingAnnotations else { return }
    pendingAnnotations = nil
    var toAdd: [PlaceAnnotation] = []
    var toRemove: [PlaceAnnotation] = []
    var seen = Set<String>()
    for record in records {
      let coordinate = CLLocationCoordinate2D(latitude: record.latitude, longitude: record.longitude)
      guard CLLocationCoordinate2DIsValid(coordinate) else { continue }
      seen.insert(record.id)
      let fresh = PlaceAnnotation(
        id: record.id,
        coordinate: coordinate,
        title: record.title,
        icon: record.icon,
        colorHex: record.color,
        layerId: record.layerId
      )
      if let existing = annotationsById[record.id] {
        if existing.contentKey != fresh.contentKey {
          toRemove.append(existing)
          toAdd.append(fresh)
          annotationsById[record.id] = fresh
        }
      } else {
        annotationsById[record.id] = fresh
        toAdd.append(fresh)
      }
    }
    for (id, annotation) in annotationsById where !seen.contains(id) {
      toRemove.append(annotation)
      annotationsById.removeValue(forKey: id)
    }
    if !toRemove.isEmpty { mapView.removeAnnotations(toRemove) }
    if !toAdd.isEmpty { mapView.addAnnotations(toAdd) }
  }

  // MARK: - Camera helpers

  func fit(to coordinates: [CLLocationCoordinate2D], padding: UIEdgeInsets, animated: Bool) {
    guard !coordinates.isEmpty else { return }
    var rect = MKMapRect.null
    for coordinate in coordinates {
      let point = MKMapPoint(coordinate)
      rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 0, height: 0))
    }
    // Co-located points make a degenerate rect, which MapKit would zoom into
    // the ground; give it a sane minimum extent instead.
    if rect.size.width < 1 || rect.size.height < 1 {
      rect = rect.insetBy(dx: -5000, dy: -5000)
    }
    mapView.setVisibleMapRect(rect, edgePadding: padding, animated: animated)
  }

  private func zoom(to cluster: MKClusterAnnotation) {
    fit(to: cluster.memberAnnotations.map(\.coordinate), padding: clusterFitPadding, animated: true)
  }

  // MARK: - MKMapViewDelegate

  func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    // nil keeps the user-location blue dot on MapKit's own view.
    if annotation is MKUserLocation { return nil }
    if annotation is MKClusterAnnotation {
      return mapView.dequeueReusableAnnotationView(withIdentifier: ClusterMarkerView.reuseID, for: annotation)
    }
    if annotation is PlaceAnnotation {
      return mapView.dequeueReusableAnnotationView(withIdentifier: PlacePinView.reuseID, for: annotation)
    }
    return nil
  }

  func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
    // The map's internal scroll view carries the pan/pinch recognizers; an
    // active one at will-change time means the user drives this move.
    if isUserInteracting() { regionChangeIsFromGesture = true }
  }

  func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
    let region = mapView.region
    onRegionChange([
      "latitude": region.center.latitude,
      "longitude": region.center.longitude,
      "latitudeDelta": region.span.latitudeDelta,
      "longitudeDelta": region.span.longitudeDelta,
      "isUserGesture": regionChangeIsFromGesture,
    ])
    regionChangeIsFromGesture = false
  }

  private func isUserInteracting() -> Bool {
    guard let recognizers = mapView.subviews.first?.gestureRecognizers else { return false }
    return recognizers.contains {
      $0.state == .began || $0.state == .changed || $0.state == .ended
    }
  }

  func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
    if let cluster = view.annotation as? MKClusterAnnotation {
      // A cluster tap zooms instead of selecting; defer the deselect out of
      // the selection callback so MapKit finishes its own bookkeeping first.
      DispatchQueue.main.async {
        mapView.deselectAnnotation(cluster, animated: false)
        self.zoom(to: cluster)
      }
    } else if let place = view.annotation as? PlaceAnnotation {
      onMarkerPress(["id": place.id])
    }
  }

  func mapView(
    _ mapView: MKMapView,
    annotationView view: MKAnnotationView,
    calloutAccessoryControlTapped control: UIControl
  ) {
    if let place = view.annotation as? PlaceAnnotation {
      onCalloutAccessoryPress(["id": place.id])
    }
  }
}

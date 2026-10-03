import ExpoModulesCore
import MapKit

struct MapAnnotationRecord: Record {
  @Field var id: String = ""
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var title: String = ""
  @Field var emoji: String = "📍"
  @Field var color: String = "#8E8E93"
  @Field var layerId: String = ""
}

struct RegionRecord: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var latitudeDelta: Double = 0.4
  @Field var longitudeDelta: Double = 0.4

  var mkRegion: MKCoordinateRegion {
    MKCoordinateRegion(
      center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
      span: MKCoordinateSpan(latitudeDelta: latitudeDelta, longitudeDelta: longitudeDelta)
    )
  }
}

struct CoordinateRecord: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0

  var clCoordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

struct EdgePaddingRecord: Record {
  @Field var top: Double = 0
  @Field var left: Double = 0
  @Field var right: Double = 0
  @Field var bottom: Double = 0

  var uiEdgeInsets: UIEdgeInsets {
    UIEdgeInsets(top: top, left: left, bottom: bottom, right: right)
  }
}

public class GuidedMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GuidedMap")

    View(GuidedMapView.self) {
      Events("onMapReady", "onRegionChange", "onMarkerPress", "onCalloutAccessoryPress")

      Prop("annotations") { (view: GuidedMapView, annotations: [MapAnnotationRecord]) in
        // Staged here, applied in OnViewDidUpdateProps — one diff per batch.
        view.pendingAnnotations = annotations
      }

      Prop("initialRegion") { (view: GuidedMapView, region: RegionRecord?) in
        view.setInitialRegionOnce(region?.mkRegion)
      }

      Prop("showsUserLocation") { (view: GuidedMapView, shows: Bool) in
        view.mapView.showsUserLocation = shows
      }

      Prop("clusterFitPadding") { (view: GuidedMapView, padding: EdgePaddingRecord?) in
        view.clusterFitPadding = padding?.uiEdgeInsets ?? .zero
      }

      OnViewDidUpdateProps { (view: GuidedMapView) in
        view.applyAnnotationDiff()
      }

      AsyncFunction("setRegion") { (view: GuidedMapView, region: RegionRecord, animated: Bool) in
        view.mapView.setRegion(region.mkRegion, animated: animated)
      }

      // Pan without changing zoom (used to focus a tapped place).
      AsyncFunction("setCenter") { (view: GuidedMapView, center: CoordinateRecord, animated: Bool) in
        view.mapView.setCenter(center.clCoordinate, animated: animated)
      }

      AsyncFunction("fitToCoordinates") {
        (view: GuidedMapView, coordinates: [CoordinateRecord], padding: EdgePaddingRecord, animated: Bool) in
        view.fit(to: coordinates.map(\.clCoordinate), padding: padding.uiEdgeInsets, animated: animated)
      }

      AsyncFunction("getCamera") { (view: GuidedMapView) -> [String: Double] in
        let camera = view.mapView.camera
        return [
          "latitude": camera.centerCoordinate.latitude,
          "longitude": camera.centerCoordinate.longitude,
          "altitude": camera.centerCoordinateDistance,
        ]
      }

      // Step the zoom: factor 0.5 zooms in, 2 zooms out.
      AsyncFunction("zoomBy") { (view: GuidedMapView, factor: Double) in
        guard let camera = view.mapView.camera.copy() as? MKMapCamera else { return }
        camera.centerCoordinateDistance = max(camera.centerCoordinateDistance * factor, 250)
        view.mapView.setCamera(camera, animated: true)
      }
    }
  }
}

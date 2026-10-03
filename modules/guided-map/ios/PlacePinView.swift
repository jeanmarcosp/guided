import MapKit
import UIKit

/// Stock Apple Maps balloon marker for a single place: the layer's color via
/// `markerTintColor`, the layer's emoji via `glyphText` — both native
/// MKMarkerAnnotationView properties, so the look, selection animation, and
/// callout are entirely MapKit's. `clusteringIdentifier` opts the pin into
/// native clustering (MKClusterAnnotation, rendered by ClusterMarkerView).
final class PlacePinView: MKMarkerAnnotationView {
  static let reuseID = "guided-place-pin"

  override var annotation: MKAnnotation? {
    didSet { configure() }
  }

  override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
    canShowCallout = true

    // Stock disclosure button; tapping it opens the place in Apple Maps.
    rightCalloutAccessoryView = UIButton(type: .detailDisclosure)

    configure()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    // MapKit clears clusteringIdentifier on some reuse paths; re-opt-in.
    clusteringIdentifier = "place"
  }

  private func configure() {
    guard let place = annotation as? PlaceAnnotation else { return }
    clusteringIdentifier = "place"
    markerTintColor = UIColor(hexString: place.colorHex)
    glyphText = place.emoji
  }
}

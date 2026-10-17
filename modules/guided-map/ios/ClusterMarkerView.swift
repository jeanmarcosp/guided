import MapKit
import UIKit

/// Apple's stock cluster balloon — MKMarkerAnnotationView shows the member
/// count as its glyph automatically for an MKClusterAnnotation. The only
/// styling is the native `markerTintColor`, taken from the most common member
/// layer. No callout — tapping a cluster only zooms (GuidedMapView.didSelect).
final class ClusterMarkerView: MKMarkerAnnotationView {
  static let reuseID = "guided-cluster"

  override var annotation: MKAnnotation? {
    didSet { configure() }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
    configure()
  }

  private func configure() {
    guard let cluster = annotation as? MKClusterAnnotation else { return }
    let members = cluster.memberAnnotations.compactMap { $0 as? PlaceAnnotation }
    markerTintColor = UIColor(hexString: dominantColorHex(members))
  }

  /// Most common layerId among members wins; the balloon takes that layer's
  /// color. First to reach the peak count breaks ties (same rule as the old
  /// supercluster implementation).
  private func dominantColorHex(_ members: [PlaceAnnotation]) -> String {
    var counts: [String: Int] = [:]
    var colorForLayer: [String: String] = [:]
    var best = ""
    var bestCount = 0
    for member in members {
      if colorForLayer[member.layerId] == nil { colorForLayer[member.layerId] = member.colorHex }
      let count = (counts[member.layerId] ?? 0) + 1
      counts[member.layerId] = count
      if count > bestCount {
        bestCount = count
        best = member.layerId
      }
    }
    return colorForLayer[best] ?? "#8E8E93"
  }
}

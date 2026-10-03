import MapKit
import UIKit

/// One saved place as a MapKit annotation. Immutable by design: the diff in
/// GuidedMapView replaces the whole object when any field changes, because
/// MapKit neither re-clusters an annotation whose coordinate is mutated in
/// place nor refreshes a dequeued view's image on field changes.
final class PlaceAnnotation: NSObject, MKAnnotation {
  let id: String
  let coordinate: CLLocationCoordinate2D
  /// Shown by the native callout.
  let title: String?
  let emoji: String
  let colorHex: String
  let layerId: String

  /// Everything the map renders or clusters on; a mismatch means replace.
  var contentKey: String {
    "\(coordinate.latitude)|\(coordinate.longitude)|\(title ?? "")|\(emoji)|\(colorHex)|\(layerId)"
  }

  init(
    id: String,
    coordinate: CLLocationCoordinate2D,
    title: String,
    emoji: String,
    colorHex: String,
    layerId: String
  ) {
    self.id = id
    self.coordinate = coordinate
    self.title = title
    self.emoji = emoji
    self.colorHex = colorHex
    self.layerId = layerId
  }
}

extension UIColor {
  /// Parses "#RRGGBB" (leading '#' optional). Falls back to system gray so a
  /// malformed layer color can never make pins invisible.
  convenience init(hexString: String) {
    var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    var value: UInt64 = 0
    guard hex.count == 6, Scanner(string: hex).scanHexInt64(&value) else {
      self.init(red: 0.56, green: 0.56, blue: 0.58, alpha: 1) // #8E8E93
      return
    }
    self.init(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
}

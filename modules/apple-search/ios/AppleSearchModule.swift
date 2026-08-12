import ExpoModulesCore
import MapKit

/**
 * Wraps Apple's MKLocalSearch so JS can query the same place database that
 * powers Apple Maps. No API key or Apple Developer account required.
 */
public class AppleSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleSearch")

    AsyncFunction("search") {
      (query: String, latitude: Double?, longitude: Double?, promise: Promise) in
      DispatchQueue.main.async {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query

        if let lat = latitude, let lon = longitude {
          let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
          request.region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 60000,
            longitudinalMeters: 60000
          )
        }

        let search = MKLocalSearch(request: request)
        search.start { (response, error) in
          if let error = error {
            promise.reject("APPLE_SEARCH_ERROR", error.localizedDescription)
            return
          }

          let results: [[String: Any]] = (response?.mapItems ?? []).map { item in
            let placemark = item.placemark
            var dict: [String: Any] = [
              "name": item.name ?? placemark.name ?? "Unnamed place",
              "latitude": placemark.coordinate.latitude,
              "longitude": placemark.coordinate.longitude,
            ]
            if let address = AppleSearchModule.formatAddress(placemark) {
              dict["address"] = address
            }
            if let category = item.pointOfInterestCategory?.rawValue {
              dict["category"] = category
            }
            return dict
          }

          promise.resolve(results)
        }
      }
    }

    // Resolve the real Apple POI nearest the coordinate and open its place card
    // (photos/reviews/hours) in Apple Maps — same as MKMapItem.openInMaps().
    AsyncFunction("openInMaps") {
      (query: String, latitude: Double, longitude: Double, promise: Promise) in
      DispatchQueue.main.async {
        let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        let target = CLLocation(latitude: latitude, longitude: longitude)

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = MKCoordinateRegion(
          center: center,
          latitudinalMeters: 1200,
          longitudinalMeters: 1200
        )

        let search = MKLocalSearch(request: request)
        search.start { (response, _) in
          let items = response?.mapItems ?? []
          // Pick the result closest to the saved coordinate (disambiguates
          // generic names like "Starbucks").
          let best = items.min { a, b in
            let la = CLLocation(latitude: a.placemark.coordinate.latitude, longitude: a.placemark.coordinate.longitude)
            let lb = CLLocation(latitude: b.placemark.coordinate.latitude, longitude: b.placemark.coordinate.longitude)
            return la.distance(from: target) < lb.distance(from: target)
          }

          let item: MKMapItem
          if let match = best {
            item = match
          } else {
            // Fallback: a plain pin at the coordinate.
            item = MKMapItem(placemark: MKPlacemark(coordinate: center))
            item.name = query
          }
          item.openInMaps(launchOptions: nil)
          promise.resolve(best != nil)
        }
      }
    }
  }

  /// Build a compact single-line address from placemark components.
  private static func formatAddress(_ placemark: MKPlacemark) -> String? {
    var parts: [String] = []
    let street = [placemark.subThoroughfare, placemark.thoroughfare]
      .compactMap { $0 }
      .joined(separator: " ")
    if !street.isEmpty { parts.append(street) }
    if let city = placemark.locality { parts.append(city) }
    if let state = placemark.administrativeArea { parts.append(state) }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

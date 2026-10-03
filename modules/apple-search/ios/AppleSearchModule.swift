import ExpoModulesCore
import MapKit

/// Delegate bridge for MKLocalSearchCompleter (it only reports via delegate).
private final class CompleterDelegate: NSObject, MKLocalSearchCompleterDelegate {
  var onResults: (([MKLocalSearchCompletion]) -> Void)?

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    onResults?(completer.results)
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    // Treat failures (offline, throttled) as "no suggestions" — the search
    // screen falls back to its full-search path.
    onResults?([])
  }
}

/**
 * Wraps Apple's MKLocalSearch so JS can query the same place database that
 * powers Apple Maps. No API key or Apple Developer account required.
 */
public class AppleSearchModule: Module {
  // Completer state — main-queue only (every entry point dispatches to main).
  private var completer: MKLocalSearchCompleter?
  private let completerDelegate = CompleterDelegate()
  private var pendingCompletions: Promise?
  private var lastCompletions: [MKLocalSearchCompletion] = []
  private var lastPayload: [[String: Any]] = []

  public func definition() -> ModuleDefinition {
    Name("AppleSearch")

    // Type-ahead suggestions via MKLocalSearchCompleter — the engine behind
    // Apple Maps' own search field. Completions carry no coordinates; resolve
    // the tapped one with resolveCompletion below.
    AsyncFunction("getCompletions") {
      (fragment: String, latitude: Double?, longitude: Double?, promise: Promise) in
      DispatchQueue.main.async {
        let completer = self.ensureCompleter()
        if let lat = latitude, let lon = longitude {
          completer.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            latitudinalMeters: 60000,
            longitudinalMeters: 60000
          )
        }
        // Same fragment again (e.g. re-focus): the completer won't re-fire its
        // delegate, so answer from the cache instead of hanging the promise.
        if completer.queryFragment == fragment, !self.lastPayload.isEmpty {
          promise.resolve(self.lastPayload)
          return
        }
        // A newer fragment supersedes any in-flight request; the screen keys
        // results by request anyway, so resolve the stale one empty.
        self.pendingCompletions?.resolve([])
        self.pendingCompletions = promise
        completer.queryFragment = fragment
      }
    }

    // Resolve a completion (by index into the most recent set) to a concrete
    // place. Rejects if the list changed under the tap — callers fall back to
    // a plain text search.
    AsyncFunction("resolveCompletion") { (index: Int, title: String, promise: Promise) in
      DispatchQueue.main.async {
        guard index >= 0, index < self.lastCompletions.count,
          self.lastCompletions[index].title == title
        else {
          promise.reject("STALE_COMPLETION", "The suggestion list changed; search by text instead")
          return
        }
        let request = MKLocalSearch.Request(completion: self.lastCompletions[index])
        MKLocalSearch(request: request).start { (response, error) in
          guard let item = response?.mapItems.first else {
            promise.reject("APPLE_SEARCH_ERROR", error?.localizedDescription ?? "No match found")
            return
          }
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
          promise.resolve(dict)
        }
      }
    }

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

  /// Lazy single completer — one per app is plenty; it self-throttles and
  /// auto-cancels when the fragment changes.
  private func ensureCompleter() -> MKLocalSearchCompleter {
    if let completer { return completer }
    let created = MKLocalSearchCompleter()
    // Concrete places only (.query suggestions like "coffee" have nothing to
    // resolve to a coordinate, and this search exists to add specific places).
    created.resultTypes = [.pointOfInterest, .address]
    created.delegate = completerDelegate
    completerDelegate.onResults = { [weak self] completions in
      guard let self else { return }
      self.lastCompletions = completions
      self.lastPayload = completions.enumerated().map { (index, completion) in
        [
          "index": index,
          "title": completion.title,
          "subtitle": completion.subtitle,
          "titleRanges": completion.titleHighlightRanges.map {
            ["location": $0.rangeValue.location, "length": $0.rangeValue.length]
          },
        ]
      }
      self.pendingCompletions?.resolve(self.lastPayload)
      self.pendingCompletions = nil
    }
    completer = created
    return created
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

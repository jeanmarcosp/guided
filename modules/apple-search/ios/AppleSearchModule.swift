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

/// Dismisses the in-app place card when its close button is tapped.
@available(iOS 18.0, *)
private final class PlaceCardDelegate: NSObject, MKMapItemDetailViewControllerDelegate {
  func mapItemDetailViewControllerDidFinish(_ detailViewController: MKMapItemDetailViewController) {
    detailViewController.dismiss(animated: true)
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
  /// Retains the in-app place card's delegate while a card is up (AnyObject so
  /// the stored property needs no iOS 18 availability).
  private var placeCardDelegate: AnyObject?

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
          promise.resolve(AppleSearchModule.placeDict(item))
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

          let results = (response?.mapItems ?? []).map(AppleSearchModule.placeDict)
          promise.resolve(results)
        }
      }
    }

    // Open the place card (photos/reviews/hours) in the Apple Maps app.
    // A stored Place ID resolves the exact POI; otherwise fall back to the
    // closest name match near the coordinate. Resolves with the item's Place
    // ID (or nil) so callers could persist it.
    AsyncFunction("openInMaps") {
      (query: String, latitude: Double, longitude: Double, appleId: String?, promise: Promise) in
      DispatchQueue.main.async {
        self.resolveItem(appleId: appleId, query: query, latitude: latitude, longitude: longitude) {
          item in
          item.openInMaps(launchOptions: nil)
          promise.resolve(AppleSearchModule.placeId(of: item))
        }
      }
    }

    // Show the full native place card INSIDE the app (MKMapItemDetailViewController,
    // iOS 18+). Pre-18 falls back to opening the Apple Maps app.
    AsyncFunction("showPlaceCard") {
      (query: String, latitude: Double, longitude: Double, appleId: String?, promise: Promise) in
      DispatchQueue.main.async {
        self.resolveItem(appleId: appleId, query: query, latitude: latitude, longitude: longitude) {
          item in
          if #available(iOS 18.0, *) {
            guard let presenter = self.appContext?.utilities?.currentViewController() else {
              item.openInMaps(launchOptions: nil)
              promise.resolve(AppleSearchModule.placeId(of: item))
              return
            }
            let detail = MKMapItemDetailViewController(mapItem: item)
            let delegate = PlaceCardDelegate()
            self.placeCardDelegate = delegate // retained until the next card
            detail.delegate = delegate
            presenter.present(detail, animated: true)
          } else {
            item.openInMaps(launchOptions: nil)
          }
          promise.resolve(AppleSearchModule.placeId(of: item))
        }
      }
    }
  }

  /// Resolve a place to its MKMapItem: exact lookup by stable Place ID when
  /// one is stored (iOS 18+), otherwise the closest name match near the
  /// coordinate, otherwise a plain pin. Always calls back on the main queue.
  private func resolveItem(
    appleId: String?,
    query: String,
    latitude: Double,
    longitude: Double,
    completion: @escaping (MKMapItem) -> Void
  ) {
    if #available(iOS 18.0, *), let raw = appleId, let identifier = MKMapItem.Identifier(rawValue: raw) {
      MKMapItemRequest(mapItemIdentifier: identifier).getMapItem { item, _ in
        DispatchQueue.main.async {
          if let item {
            completion(item)
          } else {
            // The ID went stale (place removed/superseded) — fuzzy fallback.
            AppleSearchModule.closestMatch(query: query, latitude: latitude, longitude: longitude, completion: completion)
          }
        }
      }
      return
    }
    AppleSearchModule.closestMatch(query: query, latitude: latitude, longitude: longitude, completion: completion)
  }

  /// The pre-Place-ID heuristic: search the name near the coordinate and pick
  /// the closest hit (disambiguates generic names like "Starbucks"); a plain
  /// pin when nothing matches.
  private static func closestMatch(
    query: String,
    latitude: Double,
    longitude: Double,
    completion: @escaping (MKMapItem) -> Void
  ) {
    let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    let target = CLLocation(latitude: latitude, longitude: longitude)

    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    request.region = MKCoordinateRegion(
      center: center,
      latitudinalMeters: 1200,
      longitudinalMeters: 1200
    )

    MKLocalSearch(request: request).start { (response, _) in
      let best = (response?.mapItems ?? []).min { a, b in
        let la = CLLocation(latitude: a.placemark.coordinate.latitude, longitude: a.placemark.coordinate.longitude)
        let lb = CLLocation(latitude: b.placemark.coordinate.latitude, longitude: b.placemark.coordinate.longitude)
        return la.distance(from: target) < lb.distance(from: target)
      }
      if let best {
        completion(best)
      } else {
        let pin = MKMapItem(placemark: MKPlacemark(coordinate: center))
        pin.name = query
        completion(pin)
      }
    }
  }

  /// The stable Apple Maps Place ID, when the OS and the item have one.
  private static func placeId(of item: MKMapItem) -> String? {
    if #available(iOS 18.0, *) {
      return item.identifier?.rawValue
    }
    return nil
  }

  /// Serialized place for JS — shared by search results and completion resolution.
  private static func placeDict(_ item: MKMapItem) -> [String: Any] {
    let placemark = item.placemark
    var dict: [String: Any] = [
      "name": item.name ?? placemark.name ?? "Unnamed place",
      "latitude": placemark.coordinate.latitude,
      "longitude": placemark.coordinate.longitude,
    ]
    if let address = formatAddress(placemark) {
      dict["address"] = address
    }
    if let category = item.pointOfInterestCategory?.rawValue {
      dict["category"] = category
    }
    if let appleId = placeId(of: item) {
      dict["appleId"] = appleId
    }
    return dict
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

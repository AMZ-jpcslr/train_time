import CoreLocation
import Foundation
import Combine
import WidgetKit

private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

// The host app owns location updates. WidgetKit never requests location itself.
// Everything containing coordinates stays in memory and in the single HTTPS request body.
final class BackgroundWalking: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = BackgroundWalking()
    @Published private(set) var enabled = false
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var message = "バックグラウンド更新はOFFです。"
    private let manager = CLLocationManager()
    private let session = URLSession(configuration: .ephemeral)
    private let redirects = NoRedirect()
    private var requestTask: Task<Void, Never>?
    private var lastAttempt: Date?
    private var lastOrigin: CLLocation?
    private var nextAttempt = Date.distantPast
    private var failures = 0
    private var deadlineTimer: Timer?
    private var requestGeneration = 0

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 20
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = true
        manager.showsBackgroundLocationIndicator = true
        authorization = manager.authorizationStatus
    }

    func requestForegroundPermission() { manager.requestWhenInUseAuthorization() }
    func requestAlwaysPermission() {
        guard authorization == .authorizedWhenInUse else {
            message = "先に「使用中」の位置情報を許可してください。"; return
        }
        manager.requestAlwaysAuthorization()
    }
    func setEnabled(_ value: Bool) {
        guard value else { stop("バックグラウンド更新を停止しました。"); return }
        guard authorization == .authorizedAlways else { message = "位置情報を「常に」に許可してからONにしてください。"; return }
        guard activeSnapshot() != nil else { message = "現在地を使った電車情報をWeb画面から保存してください。登録地点は背景更新しません。"; return }
        enabled = true
        manager.allowsBackgroundLocationUpdates = true
        manager.startUpdatingLocation()
        message = "背景更新中です。GPSの頻度と継続はiOSが調整します。"
        scheduleDeadline()
    }
    func stop(_ reason: String = "バックグラウンド更新を停止しました。") {
        enabled = false; manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false
        requestGeneration += 1; requestTask?.cancel(); requestTask = nil
        deadlineTimer?.invalidate(); deadlineTimer = nil
        lastOrigin = nil; lastAttempt = nil; failures = 0; nextAttempt = .distantPast
        message = reason
    }
    func snapshotChanged() {
        // An in-flight response must not overwrite a newly selected train or station.
        requestGeneration += 1; requestTask?.cancel(); requestTask = nil
        lastOrigin = nil
        if enabled {
            guard activeSnapshot() != nil else { stop("保存した対象が変わったため背景更新を停止しました。"); return }
            scheduleDeadline()
        }
    }
    private func activeSnapshot() -> WidgetSnapshot? {
        guard TrustedOrigin.configuredURL(UserDefaults.standard.string(forKey: "configuredWebAppURL") ?? "") != nil,
              let snapshot = SnapshotStore.load(), snapshot.routingTarget != nil,
              WidgetState.resolve(snapshot, at: Date()).status == .ready else { return nil }
        return snapshot
    }
    private func scheduleDeadline() {
        deadlineTimer?.invalidate()
        guard let snapshot = activeSnapshot(), let final = snapshot.departures.last else { return }
        let end = min(snapshot.timetableValidUntil, final.departureAt) / 1000
        deadlineTimer = Timer.scheduledTimer(withTimeInterval: max(1, end - Date().timeIntervalSince1970), repeats: false) { [weak self] _ in
            self?.stop("保存した電車の発車または時刻表の期限で背景更新を終了しました。")
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        if enabled && authorization != .authorizedAlways { stop("位置情報の許可が変わったため停止しました。") }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { stop("位置情報が許可されていません。") }
        else { message = "位置情報を取得できません。以前の徒歩情報は期限が切れると停止します。" }
    }
    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
        message = "iOSが位置更新を一時停止しています。必要なときはアプリを開いてください。"
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard enabled else { return }
        guard let snapshot = activeSnapshot() else { stop("対象の電車または時刻表の期限が切れたため停止しました。"); return }
        let now = Date()
        guard requestTask == nil, now >= nextAttempt,
              let fix = locations.last, fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= 100,
              now.timeIntervalSince(fix.timestamp) >= -30, now.timeIntervalSince(fix.timestamp) < 300,
              CLLocationCoordinate2DIsValid(fix.coordinate),
              lastAttempt.map({ now.timeIntervalSince($0) >= 150 }) ?? true else { return }
        if let previous = lastOrigin, let attempted = lastAttempt,
           fix.distance(from: previous) < 60 && now.timeIntervalSince(attempted) < 240 { return }
        guard let base = TrustedOrigin.configuredURL(UserDefaults.standard.string(forKey: "configuredWebAppURL") ?? ""),
              let target = snapshot.routingTarget,
              let endpoint = URL(string: "/api/walking", relativeTo: base)?.absoluteURL else { return }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"; request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var originParts = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        originParts.path = ""; originParts.query = nil; originParts.fragment = nil
        request.setValue(originParts.string, forHTTPHeaderField: "Origin")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "origin": ["lat": fix.coordinate.latitude, "lon": fix.coordinate.longitude],
            "stationId": target.stationId, "entranceId": target.entranceId
        ])
        lastAttempt = now
        requestGeneration += 1
        let generation = requestGeneration
        requestTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { if self.requestGeneration == generation { self.requestTask = nil } }
            do {
                let (bytes, response) = try await self.session.bytes(for: request, delegate: self.redirects)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                      response.expectedContentLength <= 2 * 1024 * 1024 else { throw URLError(.badServerResponse) }
                var data = Data()
                for try await byte in bytes {
                    try Task.checkCancellation()
                    guard data.count < 2 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
                    data.append(byte)
                }
                let route = try WalkingUpdate.parse(data, entranceID: target.entranceId, speedKmh: snapshot.speedKmh,
                                                    origin: (lat: fix.coordinate.latitude, lon: fix.coordinate.longitude))
                try Task.checkCancellation()
                guard self.enabled, let current = self.activeSnapshot(), current == snapshot,
                      Date().timeIntervalSince(fix.timestamp) < 300 else { return }
                let validUntil = min(snapshot.timetableValidUntil, min((fix.timestamp.timeIntervalSince1970 + 300) * 1000, route.fetchedAt + 600_000))
                guard validUntil > Date().timeIntervalSince1970 * 1000 else { throw URLError(.cannotParseResponse) }
                let updated = snapshot.replacingWalking(minutes: route.minutes, validUntil: validUntil, updatedAt: route.fetchedAt)
                try SnapshotStore.save(updated.canonicalData())
                self.lastOrigin = fix; self.failures = 0; self.nextAttempt = .distantPast
                self.message = "現在地からの徒歩時間を更新しました。"
                WidgetCenter.shared.reloadTimelines(ofKind: SnapshotStore.widgetKind)
            } catch {
                if Task.isCancelled { return }
                self.failures = min(5, self.failures + 1)
                self.nextAttempt = Date().addingTimeInterval(min(1800, 150 * pow(2, Double(self.failures - 1))))
                self.message = "徒歩経路を更新できません。時間を空けて再取得します。期限切れの判定は表示しません。"
            }
        }
    }
}

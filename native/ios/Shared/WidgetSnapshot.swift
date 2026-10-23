import Foundation

struct RoutingTarget: Codable, Equatable {
    let stationId: String
    let entranceId: String
}

struct WidgetDeparture: Codable, Equatable {
    let id: String
    let departureAt: Double
    let time: String
    let destination: String
    let trainType: String?
    let platform: String?
    var date: Date { Date(timeIntervalSince1970: departureAt / 1000) }
}

struct WidgetSnapshot: Codable, Equatable {
    let schemaVersion: Int
    let generatedAt: Double
    let stationName: String
    let directionName: String
    let serviceDate: String
    let timetableValidUntil: Double
    let walkingValidUntil: Double?
    let originLabel: String
    let walkMinutes: Double?
    let stationMinutes: Double
    let speedKmh: Double
    let routingTarget: RoutingTarget?
    let routeUpdatedAt: Double?
    let selectedDepartureId: String?
    let departures: [WidgetDeparture]

    static let maximumBytes = 32 * 1024
    private static let rootKeys: Set<String> = ["schemaVersion", "generatedAt", "stationName", "directionName", "serviceDate", "timetableValidUntil", "walkingValidUntil", "originLabel", "walkMinutes", "stationMinutes", "speedKmh", "routingTarget", "selectedDepartureId", "departures"]
    private static let departureKeys: Set<String> = ["id", "departureAt", "time", "destination", "trainType", "platform"]

    enum ValidationError: Error { case invalidSnapshot }

    static func decode(_ data: Data, now: Date = Date()) throws -> WidgetSnapshot {
        guard !data.isEmpty, data.count <= maximumBytes,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              rootKeys.isSubset(of: Set(object.keys)), Set(object.keys).isSubset(of: rootKeys.union(["routeUpdatedAt"])),
              let rows = object["departures"] as? [[String: Any]], (1...5).contains(rows.count),
              rows.allSatisfy({ Set($0.keys) == departureKeys }) else { throw ValidationError.invalidSnapshot }
        if let target = object["routingTarget"] as? [String: Any], Set(target.keys) != ["stationId", "entranceId"] {
            throw ValidationError.invalidSnapshot
        }
        let value = try JSONDecoder().decode(WidgetSnapshot.self, from: data)
        guard let dayStart = serviceDayStart(value.serviceDate) else { throw ValidationError.invalidSnapshot }
        let dayStartMilliseconds = dayStart.timeIntervalSince1970 * 1000
        guard value.schemaVersion == 1,
              validTimestamp(value.generatedAt), value.generatedAt <= now.timeIntervalSince1970 * 1000 + 30_000,
              value.generatedAt >= dayStartMilliseconds, value.generatedAt < dayStartMilliseconds + 28 * 60 * 60 * 1000,
              validTimestamp(value.timetableValidUntil), value.timetableValidUntil > value.generatedAt,
              value.timetableValidUntil <= value.generatedAt + 36 * 60 * 60 * 1000,
              value.timetableValidUntil <= dayStartMilliseconds + 28 * 60 * 60 * 1000,
              validText(value.stationName, maximum: 80), validText(value.directionName, maximum: 120),
              validText(value.originLabel, maximum: 80), validServiceDate(value.serviceDate),
              value.stationMinutes.isFinite, (0...60).contains(value.stationMinutes),
              value.speedKmh.isFinite, (1...6).contains(value.speedKmh),
              value.routingTarget.map({ validText($0.stationId, maximum: 100) && validText($0.entranceId, maximum: 100) }) ?? true,
              value.routeUpdatedAt.map({ validTimestamp($0) && $0 <= now.timeIntervalSince1970 * 1000 + 30_000 }) ?? true,
              value.walkMinutes.map({ $0.isFinite && (0...240).contains($0) }) ?? true,
              value.walkingValidUntil.map(validTimestamp) ?? true,
              value.walkingValidUntil.map({ $0 <= value.timetableValidUntil && $0 <= value.generatedAt + 24 * 60 * 60 * 1000 }) ?? true,
              (value.walkMinutes == nil) == (value.walkingValidUntil == nil),
              (1...5).contains(value.departures.count),
              Set(value.departures.map(\.id)).count == value.departures.count,
              value.departures.allSatisfy({ row in
                  validText(row.id, maximum: 200) && validTimestamp(row.departureAt)
                  && row.departureAt > value.generatedAt && row.departureAt <= value.timetableValidUntil
                  && validText(row.destination, maximum: 120)
                  && (row.trainType.map { validText($0, maximum: 60) } ?? true)
                  && (row.platform.map { validText($0, maximum: 30) } ?? true)
                  && matchesServiceTime(row, dayStartMilliseconds: dayStartMilliseconds)
              }),
              zip(value.departures, value.departures.dropFirst()).allSatisfy({ $0.0.departureAt <= $0.1.departureAt }),
              value.selectedDepartureId.map({ id in value.departures.contains { $0.id == id } }) ?? true else {
            throw ValidationError.invalidSnapshot
        }
        return value
    }

    func replacingWalking(minutes: Double, validUntil: Double, updatedAt: Double) -> WidgetSnapshot {
        WidgetSnapshot(schemaVersion: schemaVersion, generatedAt: generatedAt, stationName: stationName,
                       directionName: directionName, serviceDate: serviceDate, timetableValidUntil: timetableValidUntil,
                       walkingValidUntil: validUntil, originLabel: originLabel, walkMinutes: minutes,
                       stationMinutes: stationMinutes, speedKmh: speedKmh, routingTarget: routingTarget,
                       routeUpdatedAt: updatedAt, selectedDepartureId: selectedDepartureId, departures: departures)
    }

    // Persist only typed, validated facts. Unknown/duplicate raw JSON content never reaches the shared file.
    func canonicalData() throws -> Data {
        guard var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(self)) as? [String: Any] else {
            throw ValidationError.invalidSnapshot
        }
        for key in ["walkMinutes", "walkingValidUntil", "routingTarget", "routeUpdatedAt", "selectedDepartureId"] where object[key] == nil {
            object[key] = NSNull()
        }
        object["departures"] = departures.map { row -> [String: Any] in
            ["id": row.id, "departureAt": row.departureAt, "time": row.time, "destination": row.destination,
             "trainType": row.trainType as Any? ?? NSNull(), "platform": row.platform as Any? ?? NSNull()]
        }
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard data.count <= Self.maximumBytes else { throw ValidationError.invalidSnapshot }
        return data
    }

    private static func validTimestamp(_ value: Double) -> Bool {
        value.isFinite && value >= 1_577_836_800_000 && value < 4_102_444_800_000
    }

    private static func validText(_ value: String, maximum: Int) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && value.count <= maximum
        && value.rangeOfCharacter(from: .controlCharacters) == nil
        && !value.unicodeScalars.contains { (0x202A...0x202E).contains($0.value) || (0x2066...0x2069).contains($0.value) }
    }

    private static func validServiceDate(_ value: String) -> Bool {
        serviceDayStart(value) != nil
    }
    private static func serviceDayStart(_ value: String) -> Date? {
        guard value.range(of: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
        return date
    }
    private static func matchesServiceTime(_ departure: WidgetDeparture, dayStartMilliseconds: Double) -> Bool {
        guard departure.time.range(of: "^(?:[01][0-9]|2[0-7]):[0-5][0-9](?::[0-5][0-9])?$", options: .regularExpression) != nil else { return false }
        let components = departure.time.split(separator: ":").compactMap { Int($0) }
        guard components.count == 2 || components.count == 3 else { return false }
        let seconds = components.count == 3 ? components[2] : 0
        return departure.departureAt == dayStartMilliseconds + Double(components[0] * 3600 + components[1] * 60 + seconds) * 1000
    }
}

struct WidgetState {
    enum Status: Equatable { case empty, expired, departed, ready }
    let status: Status
    let departure: WidgetDeparture?
    let leaveAt: Date?
    let walkingExpired: Bool

    static func resolve(_ snapshot: WidgetSnapshot?, at now: Date) -> WidgetState {
        guard let snapshot else { return WidgetState(status: .empty, departure: nil, leaveAt: nil, walkingExpired: false) }
        let milliseconds = now.timeIntervalSince1970 * 1000
        guard milliseconds >= snapshot.generatedAt - 30_000, milliseconds < snapshot.timetableValidUntil else {
            return WidgetState(status: .expired, departure: nil, leaveAt: nil, walkingExpired: true)
        }
        let future = snapshot.departures.filter { $0.departureAt > milliseconds }
        guard let departure = future.first(where: { $0.id == snapshot.selectedDepartureId }) ?? future.first else {
            return WidgetState(status: .departed, departure: nil, leaveAt: nil, walkingExpired: false)
        }
        let walkValid = snapshot.walkingValidUntil.map { milliseconds < $0 } ?? false
        let leaveAt = walkValid ? snapshot.walkMinutes.map {
            departure.date.addingTimeInterval(-($0 + snapshot.stationMinutes) * 60)
        } : nil
        return WidgetState(status: .ready, departure: departure, leaveAt: leaveAt, walkingExpired: !walkValid)
    }

    // Absolute transition dates plus system-rendered timers avoid storing a frozen "N minutes" label.
    static func timelineDates(_ snapshot: WidgetSnapshot?, now: Date) -> [Date] {
        guard let snapshot else { return [now] }
        var dates = [now, Date(timeIntervalSince1970: snapshot.timetableValidUntil / 1000)]
        if let expiry = snapshot.walkingValidUntil { dates.append(Date(timeIntervalSince1970: expiry / 1000)) }
        for departure in snapshot.departures {
            dates.append(departure.date)
            if let minutes = snapshot.walkMinutes { dates.append(departure.date.addingTimeInterval(-(minutes + snapshot.stationMinutes) * 60)) }
        }
        return Array(Set(dates.filter { $0 >= now })).sorted()
    }
}

enum TrustedOrigin {
    static func configuredURL(_ text: String) -> URL? {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.port.map({ (1...65535).contains($0) }) ?? true else { return nil }
        return parts.url
    }
    static func matches(_ candidate: URL?, configured: URL) -> Bool {
        guard let candidate else { return false }
        return candidate.scheme?.lowercased() == "https"
            && candidate.host?.lowercased() == configured.host?.lowercased()
            && (candidate.port ?? 443) == (configured.port ?? 443)
            && candidate.user == nil && candidate.password == nil
    }
}

import Foundation

enum WalkingUpdate {
    struct Result { let minutes: Double; let fetchedAt: Double }
    private struct Origin: Decodable { let lat: Double; let lon: Double }
    private struct Reply: Decodable {
        let kind: String
        let entranceId: String
        let distanceMeters: Double
        let durationSeconds: Double
        let snapDistances: [Double]
        let fetchedAt: Double
        let origin: Origin
    }
    static func parse(_ data: Data, entranceID: String, speedKmh: Double,
                      origin: (lat: Double, lon: Double), now: Date = Date()) throws -> Result {
        guard data.count <= 2 * 1024 * 1024, speedKmh.isFinite, (1...6).contains(speedKmh) else { throw WidgetSnapshot.ValidationError.invalidSnapshot }
        // Decodable rejects JSON booleans used where a numeric duration/distance is required.
        let reply = try JSONDecoder().decode(Reply.self, from: data)
        guard reply.kind == "route", reply.entranceId == entranceID,
              reply.distanceMeters.isFinite, (0...100_000).contains(reply.distanceMeters),
              reply.durationSeconds.isFinite, (0...86_400).contains(reply.durationSeconds),
              reply.fetchedAt.isFinite, reply.fetchedAt >= now.timeIntervalSince1970 * 1000 - 600_000,
              reply.fetchedAt <= now.timeIntervalSince1970 * 1000 + 30_000,
              reply.origin.lat.isFinite, reply.origin.lon.isFinite,
              abs(reply.origin.lat - origin.lat) <= 0.00001, abs(reply.origin.lon - origin.lon) <= 0.00001,
              reply.snapDistances.count == 2,
              reply.snapDistances.allSatisfy({ $0.isFinite && (0...30).contains($0) }) else { throw WidgetSnapshot.ValidationError.invalidSnapshot }
        let minutes = ceil(max(reply.durationSeconds * 4.5 / speedKmh, reply.distanceMeters / (speedKmh / 3.6)) / 60)
        guard minutes <= 240 else { throw WidgetSnapshot.ValidationError.invalidSnapshot }
        return Result(minutes: minutes, fetchedAt: reply.fetchedAt)
    }
}

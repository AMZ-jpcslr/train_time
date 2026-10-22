import Foundation

enum SnapshotStore {
    static let widgetKind = "ManiauDepartureWidget"
    private static var fileURL: URL? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "ManiauAppGroup") as? String,
              !group.isEmpty, !group.contains("$(") else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("widget-snapshot-v1.json", isDirectory: false)
    }
    static func save(_ data: Data) throws {
        let snapshot = try WidgetSnapshot.decode(data)
        guard let file = fileURL else { throw CocoaError(.fileWriteNoPermission) }
        try snapshot.canonicalData().write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func load() -> WidgetSnapshot? {
        guard let file = fileURL,
              let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
              let size = attributes[.size] as? NSNumber, size.intValue <= WidgetSnapshot.maximumBytes,
              let data = try? Data(contentsOf: file) else { return nil }
        return try? WidgetSnapshot.decode(data)
    }
    static func clear() throws {
        guard let file = fileURL else { return }
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
}

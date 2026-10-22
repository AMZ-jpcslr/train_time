import SwiftUI
import WidgetKit

struct DepartureEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    var state: WidgetState { WidgetState.resolve(snapshot, at: date) }
}

struct DepartureProvider: TimelineProvider {
    func placeholder(in context: Context) -> DepartureEntry { DepartureEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (DepartureEntry) -> Void) {
        completion(DepartureEntry(date: Date(), snapshot: SnapshotStore.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DepartureEntry>) -> Void) {
        let snapshot = SnapshotStore.load()
        let entries = WidgetState.timelineDates(snapshot, now: Date()).map { DepartureEntry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .never))
    }
}

struct DepartureWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DepartureEntry
    private let accent = Color(red: 0.78, green: 0.96, blue: 0.45)

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 4 : 6) {
            if let snapshot = entry.snapshot, entry.state.status == .ready, let departure = entry.state.departure {
                HStack {
                    Text(snapshot.stationName).font(.headline).lineLimit(1)
                    Spacer(minLength: 4)
                    if family != .systemSmall { Text(snapshot.directionName).font(.caption).lineLimit(1) }
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(departure.time).font(.system(size: 26, weight: .bold, design: .monospaced)).foregroundStyle(accent)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(departure.destination).font(.subheadline.bold()).lineLimit(1)
                        if family != .systemSmall { Text([departure.trainType, departure.platform.map { "\($0)番線" }].compactMap { $0 }.joined(separator: " · ")).font(.caption2).lineLimit(1) }
                    }
                }
                if family != .systemSmall {
                    HStack { Text("発車まで"); countdown(until: departure.date) }.font(.caption)
                }
                if let leaveAt = entry.state.leaveAt {
                    if leaveAt > entry.date {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("ここにあと").font(.caption)
                            countdown(until: leaveAt).font(.system(size: 21, weight: .bold, design: .monospaced)).foregroundStyle(accent)
                        }
                        Text("\(clock(leaveAt))までに出発する目安").font(.caption2)
                    } else { Text("出発の目安を過ぎています").font(.caption).foregroundStyle(.orange) }
                } else {
                    Text("徒歩情報を更新してください").font(.caption).foregroundStyle(.orange)
                }
                Spacer(minLength: 0)
                Text("\(snapshot.originLabel) · \(clock(Date(timeIntervalSince1970: snapshot.generatedAt / 1000)))保存").font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                if family != .systemSmall, let routeUpdatedAt = snapshot.routeUpdatedAt {
                    Text("徒歩経路 \(clock(Date(timeIntervalSince1970: routeUpdatedAt / 1000)))更新").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Text("予定時刻 · 遅延未反映 · 乗車保証なし").font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
            } else {
                Text("まにあう").font(.headline).foregroundStyle(accent)
                Text(emptyMessage).font(.subheadline.bold())
                Text("タップしてアプリを開き、ウィジェットに保存してください。").font(.caption).foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(.white)
        .containerBackground(Color(red: 0.055, green: 0.075, blue: 0.07), for: .widget)
        .widgetURL(URL(string: "maniau://open"))
    }
    private var emptyMessage: String {
        switch entry.state.status {
        case .expired: return "時刻表の確認期限が切れました"
        case .departed: return "保存した電車は発車済みです"
        default: return "駅と電車を保存すると表示します"
        }
    }
    @ViewBuilder private func countdown(until end: Date) -> some View {
        if end > entry.date {
            Text(timerInterval: entry.date...end, countsDown: true).monospacedDigit()
        } else { Text("0:00").monospacedDigit() }
    }
    private func clock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

@main
struct ManiauDepartureWidget: Widget {
    let kind = SnapshotStore.widgetKind
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DepartureProvider()) { entry in DepartureWidgetView(entry: entry) }
            .configurationDisplayName("まにあう — 出発の目安")
            .description("選んだ電車と、保存した地点にあと何分いられるかを表示します。")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

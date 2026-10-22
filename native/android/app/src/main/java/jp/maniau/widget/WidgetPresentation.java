package jp.maniau.widget;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Values are explicitly dated because Android can defer background widget refreshes. */
public final class WidgetPresentation {
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm", Locale.JAPAN).withZone(WidgetSnapshot.TOKYO);
    private static final DateTimeFormatter DATE_CLOCK = DateTimeFormatter.ofPattern("MM/dd HH:mm", Locale.JAPAN).withZone(WidgetSnapshot.TOKYO);
    public final String station, direction, departure, stay, origin, status;
    private WidgetPresentation(String station, String direction, String departure, String stay, String origin, String status) {
        this.station = station; this.direction = direction; this.departure = departure; this.stay = stay; this.origin = origin; this.status = status;
    }
    public static WidgetPresentation at(WidgetSnapshot value, long now) {
        if (value == null) return new WidgetPresentation("まにあう", "電車を選んでホームへ", "アプリから電車を保存", "タップしてアプリを開く", "", "予定時刻・遅延は未反映");
        String status = "表示 " + clock(now) + " / 時刻表 " + clock(value.generatedAt) + " / 経路 " + clock(value.routeUpdatedAt) + "\n予定時刻・遅延は未反映";
        String origin = value.originLabel + " / 構内 " + compact(value.stationMinutes) + "分";
        if (now >= value.timetableValidUntil || now < value.generatedAt - 30_000) return new WidgetPresentation(value.stationName, value.directionName, "時刻表を更新してください", "アプリを開いて再保存", origin, status);
        WidgetSnapshot.Departure selected = value.selectedAt(now);
        if (selected == null) return new WidgetPresentation(value.stationName, value.directionName, "保存した便は発車済み", "アプリで次の電車を選択", origin, status);
        String departure = selected.time + " " + selected.destination + "\n発車まで 約" + (long) Math.ceil((selected.departureAt - now) / 60000d) + "分（更新時点）";
        Long leaveAt = value.leaveAt(selected, now);
        String stay;
        if (leaveAt == null) stay = "滞在目安：現在地・徒歩時間を更新";
        else if (leaveAt <= now) stay = "出発目安 " + clock(leaveAt) + "（更新時点で経過）";
        else stay = "出発目安 " + clock(leaveAt) + " / あと" + (long) Math.floor((leaveAt - now) / 60000d) + "分（更新時点）";
        if (value.walkingValidUntil != null) status += "\n徒歩有効 " + DATE_CLOCK.format(Instant.ofEpochMilli(value.walkingValidUntil));
        return new WidgetPresentation(value.stationName, value.directionName, departure, stay, origin, status);
    }
    private static String clock(long millis) { return CLOCK.format(Instant.ofEpochMilli(millis)); }
    private static String compact(double value) { return value == Math.floor(value) ? Long.toString((long) value) : String.format(Locale.JAPAN, "%.1f", value); }
}

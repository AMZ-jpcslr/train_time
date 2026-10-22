package jp.maniau.widget;

import java.time.Instant;

public final class WidgetLogicTest {
    static final long NOW = Instant.parse("2026-10-22T03:00:00Z").toEpochMilli();
    static int assertions;
    static String data() {
        return "{\"schemaVersion\":1,\"generatedAt\":" + NOW + ",\"stationName\":\"JR茨木\",\"directionName\":\"大阪方面\",\"serviceDate\":\"2026-10-22\",\"timetableValidUntil\":" + (NOW + 12 * 3600000L) + ",\"walkingValidUntil\":" + (NOW + 300000) + ",\"originLabel\":\"現在地\",\"walkMinutes\":8,\"stationMinutes\":3,\"speedKmh\":4.8,\"routingTarget\":{\"stationId\":\"jr-ibaraki\",\"entranceId\":\"jr-ibaraki-east\"},\"selectedDepartureId\":\"second\",\"departures\":[{\"id\":\"first\",\"departureAt\":" + (NOW + 10 * 60000L) + ",\"time\":\"12:10\",\"destination\":\"新三田\",\"trainType\":\"普通\",\"platform\":null},{\"id\":\"second\",\"departureAt\":" + (NOW + 20 * 60000L) + ",\"time\":\"12:20\",\"destination\":\"姫路\",\"trainType\":\"快速\",\"platform\":\"3\"}]}";
    }
    static void yes(boolean condition, String name) { assertions++; if (!condition) throw new AssertionError(name); }
    static void reject(String json, String name) { try { WidgetSnapshot.receive(json, NOW); throw new AssertionError(name); } catch (IllegalArgumentException expected) { assertions++; } }
    public static void main(String[] args) {
        WidgetSnapshot snapshot = WidgetSnapshot.receive(data(), NOW);
        yes(snapshot.selectedAt(NOW).id.equals("second"), "selected later train takes precedence");
        yes(snapshot.leaveAt(snapshot.selectedAt(NOW), NOW) == NOW + 9 * 60000, "no separate boarding buffer");
        yes(snapshot.leaveAt(snapshot.selectedAt(NOW), NOW + 300000) == null, "walking expiry equality");
        yes(snapshot.selectedAt(NOW + 20 * 60000) == null, "departure equality excluded");
        yes(snapshot.selectedAt(snapshot.timetableValidUntil) == null, "timetable expiry equality");
        yes(snapshot.selectedAt(NOW - 60000) == null, "clock rollback");
        yes(WidgetPresentation.at(snapshot, NOW).stay.contains("あと9分"), "stay and departure countdown differ");
        yes(WidgetPresentation.at(snapshot, NOW).departure.contains("約20分"), "departure countdown");
        yes(WidgetPresentation.at(snapshot, NOW + 300000).stay.contains("更新"), "expired walking requests refresh");
        yes(WidgetPresentation.at(snapshot, NOW + 21 * 60000).departure.contains("発車済み"), "all saved departures gone");
        yes(WidgetPresentation.at(snapshot, snapshot.timetableValidUntil).departure.contains("時刻表"), "expired timetable never displayed as usable");
        yes(WidgetPresentation.at(null, NOW).departure.contains("保存"), "no data state");
        String unknown = data().replace("\"walkMinutes\":8", "\"walkMinutes\":null").replace("\"walkingValidUntil\":" + (NOW + 300000), "\"walkingValidUntil\":null");
        yes(WidgetSnapshot.receive(unknown, NOW).leaveAt(snapshot.selectedAt(NOW), NOW) == null, "unknown route remains unknown");
        String firstSelected = data().replace("\"selectedDepartureId\":\"second\"", "\"selectedDepartureId\":\"first\"");
        yes(WidgetSnapshot.receive(firstSelected, NOW).selectedAt(NOW + 10 * 60000).id.equals("second"), "expired selection falls forward");
        reject(data().replace("\"schemaVersion\":1", "\"schemaVersion\":2"), "schema");
        reject(data().replace("\"walkMinutes\":8", "\"walkMinutes\":\"8\""), "number coercion");
        reject(data().replace("\"walkMinutes\":8", "\"walkMinutes\":-1"), "negative walk");
        reject(data().replace("\"speedKmh\":4.8", "\"speedKmh\":7"), "speed bound");
        reject(data().replace("\"stationMinutes\":3", "\"stationMinutes\":1e999"), "nonfinite");
        reject(data().replace("\"id\":\"second\"", "\"id\":\"first\""), "duplicate id");
        reject(data().replace("\"stationName\":\"JR茨木\"", "\"stationName\":\"JR茨木\",\"stationName\":\"fake\""), "duplicate key");
        reject(data().replace("\"stationName\":\"JR茨木\"", "\"stationName\":\"JR茨木\",\"latitude\":34.8"), "unexpected coordinates");
        reject(data().replace("2026-10-22", "2026-02-30"), "invalid date");
        reject(data().replace("12:10", "12:11"), "timestamp time mismatch");
        reject(data().replace("\"generatedAt\":" + NOW, "\"generatedAt\":" + (NOW - 360000)), "stale incoming data");
        reject(data().replace("\"walkingValidUntil\":" + (NOW + 300000), "\"walkingValidUntil\":null"), "paired walking values");
        reject(data().replace("\"selectedDepartureId\":\"second\"", "\"selectedDepartureId\":\"unknown\""), "unknown selection");
        reject(data() + "garbage", "trailing input");
        reject(data().replace("JR茨木", "x".repeat(33000)), "size bound");
        String afterMidnight = data().replace("\"generatedAt\":" + NOW, "\"generatedAt\":" + (NOW + 12 * 3600000L)).replace("\"timetableValidUntil\":" + (NOW + 12 * 3600000L), "\"timetableValidUntil\":" + (NOW + 16 * 3600000L)).replace("\"walkingValidUntil\":" + (NOW + 300000), "\"walkingValidUntil\":" + (NOW + 12 * 3600000L + 300000)).replace("\"departureAt\":" + (NOW + 10 * 60000L), "\"departureAt\":" + (NOW + 12 * 3600000L + 10 * 60000L)).replace("\"departureAt\":" + (NOW + 20 * 60000L), "\"departureAt\":" + (NOW + 12 * 3600000L + 20 * 60000L)).replace("12:10", "24:10").replace("12:20", "00:20");
        yes(WidgetSnapshot.receive(afterMidnight, NOW + 12 * 3600000L).selectedAt(NOW + 12 * 3600000L).id.equals("second"), "service date midnight and 24h times");
        String refreshed = data().replace("\"walkMinutes\":8", "\"routeUpdatedAt\":" + (NOW + 3600000) + ",\"walkMinutes\":6").replace("\"walkingValidUntil\":" + (NOW + 300000), "\"walkingValidUntil\":" + (NOW + 3900000));
        yes(WidgetSnapshot.parse(refreshed).generatedAt == NOW, "background route does not refresh timetable timestamp");
        yes(WidgetSnapshot.receive(data().replace("\"walkMinutes\":8", "\"routeUpdatedAt\":null,\"walkMinutes\":8"), NOW).routeUpdatedAt == NOW, "nullable update timestamp");
        TrustedOrigin origin = TrustedOrigin.from("https://train-time-three.vercel.app/");
        yes(origin.permits("https://train-time-three.vercel.app/api/walking"), "same origin");
        yes(!origin.permits("https://train-time-three.vercel.app.attacker.test/"), "host suffix rejected");
        yes(!origin.permits("http://train-time-three.vercel.app/"), "cleartext rejected");
        yes(!origin.permits("https://train-time-three.vercel.app@attacker.test/"), "userinfo rejected");
        yes(!origin.permits("https://train-time-three.vercel.app:8443/"), "port change rejected");
        try { TrustedOrigin.from("file:///test.html"); throw new AssertionError("file URL"); } catch (IllegalArgumentException e) { assertions++; }
        yes(RouteUpdatePolicy.freshFix(NOW, NOW, 100), "100m GPS limit inclusive");
        yes(!RouteUpdatePolicy.freshFix(NOW, NOW, 101), "poor GPS is not used");
        yes(!RouteUpdatePolicy.freshFix(NOW, NOW - 300000, 17), "5min old GPS is not used");
        yes(!RouteUpdatePolicy.freshFix(NOW, NOW + 31000, 17), "future GPS rejected");
        yes(!RouteUpdatePolicy.freshFix(NOW, NOW, Double.NaN), "nonfinite GPS rejected");
        RouteUpdatePolicy policy = new RouteUpdatePolicy();
        yes(policy.acquire(NOW, 0, false), "first route allowed");
        yes(!policy.acquire(NOW + 150000, 100, true), "only one route in flight"); policy.success();
        yes(!policy.acquire(NOW + 149999, 100, true), "150s minimum");
        yes(!policy.acquire(NOW + 150000, 59, true), "stationary below60m waits4min");
        yes(policy.acquire(NOW + 240000, 0, true), "stationary periodic refresh");
        policy.failure(NOW + 240000);
        yes(!policy.acquire(NOW + 400000, 100, true), "failure backoff");
        yes(policy.acquire(NOW + 540000, 100, true), "backoff ends"); policy.success();
        yes(!policy.acquire(NOW, 100, true), "request clock rollback");
        RouteUpdatePolicy limited = new RouteUpdatePolicy();
        for (int i = 0; i < 24; i++) { yes(limited.acquire(NOW + i * 150000L, 100, false), "quota request " + i); limited.success(); }
        yes(!limited.acquire(NOW + 3599999, 100, false), "no25th request withinhour");
        yes(limited.acquire(NOW + 3600000, 100, false), "quota window advances");
        System.out.println("Android pure Java checks passed: " + assertions);
    }
}

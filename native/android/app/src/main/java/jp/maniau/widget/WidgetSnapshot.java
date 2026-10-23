package jp.maniau.widget;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Schema 1; holds a user-requested snapshot, never coordinates or a background location. */
public final class WidgetSnapshot {
    static final long MINUTE = 60_000L;
    static final long HOUR = 60 * MINUTE;
    static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");
    public final long generatedAt, timetableValidUntil, routeUpdatedAt;
    public final Long walkingValidUntil;
    public final String stationName, directionName, serviceDate, originLabel, selectedDepartureId;
    public final Double walkMinutes;
    public final double stationMinutes;
    public final double speedKmh;
    public final String stationId, entranceId;
    public final List<Departure> departures;

    public static final class Departure {
        public final String id, time, destination, trainType, platform;
        public final long departureAt;
        Departure(Map<?, ?> value, long dayStart) {
            keys(value, "id", "departureAt", "time", "destination", "trainType", "platform");
            id = string(value, "id", 160); time = string(value, "time", 8);
            destination = string(value, "destination", 80);
            trainType = nullableString(value, "trainType", 40); platform = nullableString(value, "platform", 20);
            departureAt = integer(value, "departureAt");
            if (!time.matches("(?:[01][0-9]|2[0-7]):[0-5][0-9](?::[0-5][0-9])?")) throw bad();
            int hours = Integer.parseInt(time.substring(0, 2)), minutes = Integer.parseInt(time.substring(3, 5));
            int seconds = time.length() == 8 ? Integer.parseInt(time.substring(6, 8)) : 0;
            long expected = dayStart + (hours * 60L + minutes) * MINUTE + seconds * 1000L;
            // Official 00:xx and operational 24:xx are both accepted for the following calendar day.
            if (departureAt != expected && !(hours < 4 && departureAt == expected + 24 * HOUR)) throw bad();
        }
    }

    private WidgetSnapshot(Map<?, ?> value) {
        java.util.Map<Object, Object> checked = new java.util.LinkedHashMap<>(value);
        Object update = checked.remove("routeUpdatedAt");
        keys(checked, "schemaVersion", "generatedAt", "stationName", "directionName", "serviceDate", "timetableValidUntil", "walkingValidUntil", "originLabel", "walkMinutes", "stationMinutes", "speedKmh", "routingTarget", "selectedDepartureId", "departures");
        if (integer(value, "schemaVersion") != 1) throw bad();
        generatedAt = integer(value, "generatedAt"); timetableValidUntil = integer(value, "timetableValidUntil");
        routeUpdatedAt = update == null ? generatedAt : integer(value, "routeUpdatedAt");
        walkingValidUntil = value.get("walkingValidUntil") == null ? null : integer(value, "walkingValidUntil");
        stationName = string(value, "stationName", 80); directionName = string(value, "directionName", 100);
        serviceDate = string(value, "serviceDate", 10); originLabel = string(value, "originLabel", 80);
        selectedDepartureId = nullableString(value, "selectedDepartureId", 160);
        walkMinutes = value.get("walkMinutes") == null ? null : number(value, "walkMinutes", 0, 240);
        stationMinutes = number(value, "stationMinutes", 0, 60);
        speedKmh = number(value, "speedKmh", 1, 6);
        Object target = value.get("routingTarget");
        if (target == null) { stationId = null; entranceId = null; }
        else {
            if (!(target instanceof Map<?, ?>)) throw bad();
            Map<?, ?> map = (Map<?, ?>) target; keys(map, "stationId", "entranceId");
            stationId = string(map, "stationId", 100); entranceId = string(map, "entranceId", 100);
            if (!stationId.matches("[a-zA-Z0-9_-]+") || !entranceId.matches("[a-zA-Z0-9_-]+")) throw bad();
        }
        if (!serviceDate.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw bad();
        LocalDate date;
        try { date = LocalDate.parse(serviceDate); } catch (RuntimeException e) { throw bad(); }
        long dayStart = date.atStartOfDay(TOKYO).toInstant().toEpochMilli();
        if (generatedAt < dayStart || generatedAt >= dayStart + 28 * HOUR || timetableValidUntil <= generatedAt || timetableValidUntil > generatedAt + 36 * HOUR) throw bad();
        if ((walkMinutes == null) != (walkingValidUntil == null)) throw bad();
        if (routeUpdatedAt < generatedAt - 10 * MINUTE || routeUpdatedAt >= timetableValidUntil) throw bad();
        if (walkingValidUntil != null && (walkingValidUntil <= routeUpdatedAt || walkingValidUntil > timetableValidUntil || walkingValidUntil > routeUpdatedAt + 24 * HOUR)) throw bad();
        Object raw = value.get("departures");
        if (!(raw instanceof List<?>)) throw bad();
        List<?> items = (List<?>) raw;
        if (items.isEmpty() || items.size() > 5) throw bad();
        ArrayList<Departure> parsed = new ArrayList<>(); Set<String> ids = new HashSet<>(); long last = 0;
        for (Object item : items) {
            if (!(item instanceof Map<?, ?>)) throw bad();
            Departure departure = new Departure((Map<?, ?>) item, dayStart);
            if (!ids.add(departure.id) || departure.departureAt < last || departure.departureAt > timetableValidUntil) throw bad();
            last = departure.departureAt; parsed.add(departure);
        }
        if (selectedDepartureId != null && !ids.contains(selectedDepartureId)) throw bad();
        departures = java.util.Collections.unmodifiableList(parsed);
    }

    public static WidgetSnapshot parse(String json) {
        if (json == null || json.length() > 32768 || json.getBytes(StandardCharsets.UTF_8).length > 32768) throw bad();
        Object raw = StrictJson.parse(json);
        if (!(raw instanceof Map<?, ?>)) throw bad();
        return new WidgetSnapshot((Map<?, ?>) raw);
    }
    public static WidgetSnapshot receive(String json, long now) {
        WidgetSnapshot value = parse(json);
        if (value.generatedAt < now - 5 * MINUTE || value.generatedAt > now + 30_000 || value.routeUpdatedAt > now + 30_000 || value.timetableValidUntil <= now) throw bad();
        return value;
    }
    public Departure selectedAt(long now) {
        if (now >= timetableValidUntil || now < generatedAt - 30_000) return null;
        Departure first = null;
        for (Departure departure : departures) if (departure.departureAt > now) {
            if (first == null) first = departure;
            if (departure.id.equals(selectedDepartureId)) return departure;
        }
        return first;
    }
    public Long leaveAt(Departure departure, long now) {
        if (walkMinutes == null || walkingValidUntil == null || now >= walkingValidUntil || now >= timetableValidUntil || now < generatedAt - 30_000) return null;
        return departure.departureAt - (long) Math.ceil((walkMinutes + stationMinutes) * MINUTE);
    }
    private static IllegalArgumentException bad() { return new IllegalArgumentException("Invalid widget snapshot"); }
    private static void keys(Map<?, ?> value, String... allowed) {
        if (value.size() != allowed.length) throw bad();
        for (String key : allowed) if (!value.containsKey(key)) throw bad();
    }
    private static String nullableString(Map<?, ?> value, String key, int max) { return value.get(key) == null ? null : string(value, key, max); }
    private static String string(Map<?, ?> value, String key, int max) {
        Object raw = value.get(key);
        if (!(raw instanceof String)) throw bad(); String text = (String) raw;
        if (text.trim().isEmpty() || text.length() > max || text.codePoints().anyMatch(cp -> Character.isISOControl(cp) || cp == 0x202E || cp == 0x202D || (cp >= 0x2066 && cp <= 0x2069))) throw bad();
        return text;
    }
    private static double number(Map<?, ?> value, String key, double min, double max) {
        Object raw = value.get(key);
        if (!(raw instanceof Double)) throw bad(); double number = (Double) raw;
        if (!Double.isFinite(number) || number < min || number > max) throw bad(); return number;
    }
    private static long integer(Map<?, ?> value, String key) {
        double number = number(value, key, 0, 8_640_000_000_000_000L);
        if (number != Math.floor(number)) throw bad(); return (long) number;
    }
}

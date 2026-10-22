package jp.maniau.widget;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Receives a real Web-produced snapshot fixture without requiring an Android SDK. */
public final class SnapshotContractCheck {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: SnapshotContractCheck snapshot.json nowEpochMillis");
        String json = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        long now = Long.parseLong(args[1]);
        WidgetSnapshot snapshot = WidgetSnapshot.receive(json, now);
        System.out.println("Web -> Android snapshot accepted: departures=" + snapshot.departures.size() + ", walking=" + (snapshot.walkMinutes != null) + ", routing=" + (snapshot.stationId != null));
    }
}

package jp.maniau.widget;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Explicit, visible foreground tracking session. It never starts at boot or restarts itself. */
public final class WalkingUpdateService extends Service implements LocationListener {
    private static final String CHANNEL = "walking", STOP = "jp.maniau.widget.STOP";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final RouteUpdatePolicy policy = new RouteUpdatePolicy();
    private LocationManager locations;
    private Location fix, lastRouted;
    private volatile HttpsURLConnection connection;
    private volatile boolean active;
    private final Runnable tick = new Runnable() { @Override public void run() { if (active) { considerRoute(); handler.postDelayed(this, 30_000); } } };

    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "徒歩時間の背景更新", NotificationManager.IMPORTANCE_LOW));
        try { startForeground(10, notification("現在地を確認しています")); } catch (RuntimeException error) { stopSelf(); return START_NOT_STICKY; }
        if (!active) {
            active = true; locations = getSystemService(LocationManager.class);
            try {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 30_000, 5, this);
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED && locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000, 5, this);
            } catch (RuntimeException error) { stopSelf(); return START_NOT_STICKY; }
            handler.post(tick);
        }
        return START_NOT_STICKY;
    }
    private Notification notification(String message) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, WalkingUpdateService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_train).setContentTitle("まにあう：徒歩時間を背景更新中")
            .setContentText(message).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(null, "停止", stop).build()).build();
    }
    private void notifyState(String message) { getSystemService(NotificationManager.class).notify(10, notification(message)); }
    @Override public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (location.hasAccuracy() && RouteUpdatePolicy.freshFix(now, location.getTime(), location.getAccuracy()) && Double.isFinite(location.getLatitude()) && Double.isFinite(location.getLongitude()) && Math.abs(location.getLatitude()) <= 90 && Math.abs(location.getLongitude()) <= 180) {
            if (fix == null || location.getTime() > fix.getTime()) fix = new Location(location);
            considerRoute();
        } else notifyState("位置精度を確認中。アプリで現在地を更新できます");
    }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { notifyState("位置情報が無効です。端末の設定を確認してください"); }
    @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) { }
    private void considerRoute() {
        if (!active) return;
        long now = System.currentTimeMillis(); WidgetSnapshot snapshot = SnapshotStore.read(this);
        if (snapshot == null || snapshot.stationId == null || snapshot.selectedAt(now) == null) { DepartureWidget.updateAll(this); stopSelf(); return; }
        if (fix == null || !RouteUpdatePolicy.freshFix(now, fix.getTime(), fix.getAccuracy())) { DepartureWidget.updateAll(this); return; }
        String raw = SnapshotStore.raw(this), origin = SnapshotStore.origin(this);
        if (raw == null || origin == null) { stopSelf(); return; }
        // The server additionally enforces shared quotas, including foreground Web requests.
        if (!policy.acquire(now, lastRouted == null ? 0 : fix.distanceTo(lastRouted), lastRouted != null)) return;
        Location requestedFix = new Location(fix);
        network.execute(() -> {
            try {
                String updated = request(origin, snapshot, raw, requestedFix);
                handler.post(() -> {
                    policy.success(); if (!active) return;
                    if (raw.equals(SnapshotStore.raw(this)) && origin.equals(SnapshotStore.origin(this))) {
                        SnapshotStore.save(this, updated); DepartureWidget.updateAll(this); lastRouted = requestedFix;
                        notifyState("徒歩時間を更新しました。通知から停止できます");
                    }
                });
            } catch (Exception error) {
                handler.post(() -> {
                    policy.failure(System.currentTimeMillis()); if (!active) return;
                    DepartureWidget.updateAll(this); notifyState("経路を更新できません。間隔を空けて再試行します");
                });
            }
        });
    }
    private String request(String origin, WidgetSnapshot snapshot, String raw, Location position) throws Exception {
        if (!active || Thread.currentThread().isInterrupted()) throw new IllegalStateException("Tracking stopped");
        TrustedOrigin trusted = TrustedOrigin.from(origin);
        HttpsURLConnection request = (HttpsURLConnection) new URL(trusted.origin + "/api/walking").openConnection(); connection = request;
        request.setInstanceFollowRedirects(false); request.setConnectTimeout(15_000); request.setReadTimeout(20_000);
        request.setRequestMethod("POST"); request.setDoOutput(true); request.setRequestProperty("Content-Type", "application/json"); request.setRequestProperty("Origin", trusted.origin); request.setRequestProperty("Referer", trusted.origin + "/");
        request.setRequestProperty("User-Agent", "ManiauAndroidWidget/0.1");
        JSONObject coordinate = new JSONObject().put("lat", position.getLatitude()).put("lon", position.getLongitude());
        byte[] body = new JSONObject().put("origin", coordinate).put("stationId", snapshot.stationId).put("entranceId", snapshot.entranceId).toString().getBytes(StandardCharsets.UTF_8);
        request.setFixedLengthStreamingMode(body.length);
        try {
            if (!active || Thread.currentThread().isInterrupted()) throw new IllegalStateException("Tracking stopped");
            try (java.io.OutputStream stream = request.getOutputStream()) { stream.write(body); }
            if (request.getResponseCode() != 200 || request.getContentLengthLong() > 2 * 1024 * 1024) throw new IllegalArgumentException("Route unavailable");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = request.getInputStream()) { byte[] buffer = new byte[8192]; int length; while ((length = input.read(buffer)) != -1) { if (bytes.size() + length > 2 * 1024 * 1024) throw new IllegalArgumentException("Response too large"); bytes.write(buffer, 0, length); } }
            JSONObject route = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (!"route".equals(route.get("kind")) || !snapshot.entranceId.equals(route.get("entranceId"))) throw new IllegalArgumentException("Route mismatch");
            double distance = finite(route.get("distanceMeters"), 0, 150_000), duration = finite(route.get("durationSeconds"), 0, 86_400);
            JSONArray snaps = route.getJSONArray("snapDistances"); if (snaps.length() != 2) throw new IllegalArgumentException("Unknown connection");
            finite(snaps.get(0), 0, 30); finite(snaps.get(1), 0, 30);
            JSONObject returnedOrigin = route.getJSONObject("origin");
            if (Math.abs(finite(returnedOrigin.get("lat"), -90, 90) - position.getLatitude()) > 0.00001 || Math.abs(finite(returnedOrigin.get("lon"), -180, 180) - position.getLongitude()) > 0.00001) throw new IllegalArgumentException("Origin mismatch");
            long now = System.currentTimeMillis();
            double fetchedAt = finite(route.get("fetchedAt"), now - 600_000, now + 30_000);
            if (now - position.getTime() >= 300_000 || now >= snapshot.timetableValidUntil || fetchedAt < 0) throw new IllegalArgumentException("Expired route");
            double walk = Math.ceil(Math.max(duration * 4.5 / snapshot.speedKmh, distance / (snapshot.speedKmh / 3.6)) / 60);
            if (walk > 240) throw new IllegalArgumentException("Route too long");
            long validUntil = Math.min(Math.min(position.getTime() + 300_000, (long) fetchedAt + 600_000), snapshot.timetableValidUntil);
            if (validUntil <= now) throw new IllegalArgumentException("Expired route");
            String updated = new JSONObject(raw).put("walkMinutes", walk).put("walkingValidUntil", validUntil).put("routeUpdatedAt", now).toString();
            WidgetSnapshot.parse(updated); return updated;
        } finally { request.disconnect(); if (connection == request) connection = null; }
    }
    private static double finite(Object value, double min, double max) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("Number required"); double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < min || number > max) throw new IllegalArgumentException("Invalid route value"); return number;
    }
    @Override public void onDestroy() {
        active = false; handler.removeCallbacksAndMessages(null);
        if (locations != null) locations.removeUpdates(this);
        if (connection != null) connection.disconnect(); network.shutdownNow(); fix = null; lastRouted = null;
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}

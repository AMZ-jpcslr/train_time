package jp.maniau.widget;

import android.app.PendingIntent;
import android.app.AlarmManager;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public final class DepartureWidget extends AppWidgetProvider {
    private static final String REFRESH = "jp.maniau.widget.REFRESH";
    private static final String EXPIRY = "jp.maniau.widget.EXPIRY";
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction()) || EXPIRY.equals(intent.getAction()) || Intent.ACTION_TIME_CHANGED.equals(intent.getAction()) || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())) updateAll(context);
    }
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DepartureWidget.class));
        long now = System.currentTimeMillis(); WidgetSnapshot snapshot = SnapshotStore.read(context);
        WidgetPresentation view = WidgetPresentation.at(snapshot, now);
        for (int id : ids) {
            RemoteViews remote = new RemoteViews(context.getPackageName(), R.layout.departure_widget);
            remote.setTextViewText(R.id.station, view.station); remote.setTextViewText(R.id.direction, view.direction);
            remote.setTextViewText(R.id.departure, view.departure); remote.setTextViewText(R.id.stay, view.stay);
            remote.setTextViewText(R.id.origin, view.origin); remote.setTextViewText(R.id.status, view.status);
            Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            remote.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, id, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            Intent refresh = new Intent(context, DepartureWidget.class).setAction(REFRESH);
            remote.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(context, id, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id, remote);
        }
        scheduleExpiry(context, snapshot, now, ids.length > 0);
    }
    @Override public void onDisabled(Context context) { scheduleExpiry(context, null, System.currentTimeMillis(), false); }
    private static void scheduleExpiry(Context context, WidgetSnapshot snapshot, long now, boolean hasWidgets) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent pending = PendingIntent.getBroadcast(context, 2001, new Intent(context, DepartureWidget.class).setAction(EXPIRY), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(pending);
        if (!hasWidgets || snapshot == null || snapshot.timetableValidUntil <= now) return;
        long next = snapshot.timetableValidUntil;
        if (snapshot.walkingValidUntil != null && snapshot.walkingValidUntil > now) next = Math.min(next, snapshot.walkingValidUntil);
        for (WidgetSnapshot.Departure departure : snapshot.departures) if (departure.departureAt > now) next = Math.min(next, departure.departureAt);
        // No exact-alarm permission. Android can defer this; displayed values stay labelled with their update time.
        alarms.set(AlarmManager.RTC, Math.max(now + 1000, next), pending);
    }
}

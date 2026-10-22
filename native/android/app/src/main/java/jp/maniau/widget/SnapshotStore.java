package jp.maniau.widget;

import android.content.Context;
import android.content.SharedPreferences;

final class SnapshotStore {
    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences("widget", Context.MODE_PRIVATE); }
    static String origin(Context context) { return preferences(context).getString("origin", null); }
    static void setOrigin(Context context, String origin) {
        // Switching deployments discards the former snapshot; cookies are cleared by the activity.
        preferences(context).edit().clear().putString("origin", origin).apply();
    }
    static void save(Context context, String json) { preferences(context).edit().putString("snapshot", json).apply(); }
    static String raw(Context context) { return preferences(context).getString("snapshot", null); }
    static WidgetSnapshot read(Context context) {
        try { return WidgetSnapshot.parse(preferences(context).getString("snapshot", null)); }
        catch (IllegalArgumentException e) { return null; }
    }
}

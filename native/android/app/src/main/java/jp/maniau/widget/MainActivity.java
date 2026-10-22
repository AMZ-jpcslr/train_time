package jp.maniau.widget;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int GEO_PERMISSION = 12, SERVICE_PERMISSION = 13;
    private WebView web;
    private TrustedOrigin trusted;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;
    private boolean visible;
    private boolean resumeServiceStart;
    private long lastSave;
    private long configurationGeneration;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showShell();
        String saved = SnapshotStore.origin(this);
        if (saved == null) configure();
        else try { load(TrustedOrigin.from(saved)); } catch (IllegalArgumentException e) { configure(); }
    }
    private void showShell() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(16,20,17));
        root.setOnApplyWindowInsetsListener((view, insets) -> { view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets; });
        LinearLayout bar = new LinearLayout(this);
        button(bar, "接続先", this::configure); button(bar, "ウィジェット追加", this::pinWidget); button(bar, "背景更新", this::backgroundDialog);
        root.addView(bar);
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (trusted != null && trusted.permits(url)) return false;
                if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme()) && request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // The PWA's assets and API are same-origin; all other embedded content is blocked.
                if (trusted != null && trusted.permits(request.getUrl().toString())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!visible || trusted == null || !trusted.permits(origin) || !trusted.permits(web.getUrl())) { callback.invoke(origin, false, false); return; }
                new AlertDialog.Builder(MainActivity.this).setTitle("現在地の使用")
                    .setMessage("この画面で駅までの徒歩時間を計算します。位置は経路検索先へ送信されます。ウィジェットには緯度・経度を保存しません。")
                    .setNegativeButton("許可しない", (dialog, which) -> callback.invoke(origin, false, false))
                    .setOnCancelListener(dialog -> callback.invoke(origin, false, false))
                    .setPositiveButton("この画面で許可", (dialog, which) -> {
                        if (locationAllowed()) callback.invoke(origin, true, false);
                        else { denyPending(); pendingGeo = callback; pendingGeoOrigin = origin; requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, GEO_PERMISSION); }
                    }).show();
            }
        });
    }
    private void button(LinearLayout parent, String label, Runnable run) {
        Button button = new Button(this); button.setText(label); button.setTextSize(11); button.setMinHeight(dp(48));
        parent.addView(button, new LinearLayout.LayoutParams(0, dp(52), 1)); button.setOnClickListener(view -> run.run());
    }
    private int dp(int value) { return (int) (getResources().getDisplayMetrics().density * value + .5f); }
    private void configure() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); input.setHint("https://your-app.vercel.app");
        String current = SnapshotStore.origin(this); input.setText(current == null ? "https://train-time-three.vercel.app/" : current);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Webアプリの接続先")
            .setMessage("ご自身で公開した『まにあう』のHTTPS URLを設定してください。ウィジェットにはそのアプリで選んだ電車を保存します。接続先の変更で保存データを消去します。")
            .setView(input).setNegativeButton("閉じる", null).setPositiveButton("接続", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                TrustedOrigin next = TrustedOrigin.from(input.getText().toString());
                stopService(new Intent(this, WalkingUpdateService.class));
                denyPending(); web.stopLoading();
                long generation = ++configurationGeneration;
                // Revoke the old document before changing storage or awaiting async cookie removal.
                trusted = null;
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(web, "ManiauWidget");
                SnapshotStore.setOrigin(this, next.origin); WebStorage.getInstance().deleteAllData(); GeolocationPermissions.getInstance().clearAll();
                CookieManager.getInstance().removeAllCookies(removed -> {
                    if (generation != configurationGeneration || web == null || !next.origin.equals(SnapshotStore.origin(this))) return;
                    CookieManager.getInstance().flush(); load(next);
                });
                DepartureWidget.updateAll(this); dialog.dismiss();
            } catch (IllegalArgumentException error) { input.setError("HTTPSのトップURLを入力してください。パス・認証情報・クエリーは使用できません。"); }
        })); dialog.show();
    }
    private void load(TrustedOrigin next) {
        trusted = next;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(web, "ManiauWidget");
            WebViewCompat.addWebMessageListener(web, "ManiauWidget", Collections.singleton(next.origin), (view, message, source, mainFrame, reply) -> {
                if (!visible || !mainFrame || trusted != next || !next.permits(source.toString()) || !next.permits(view.getUrl()) || message.getType() != WebMessageCompat.TYPE_STRING) return;
                long now = System.currentTimeMillis();
                if (now - lastSave < 1000) { ack(false); return; }
                try {
                    String json = message.getData(); WidgetSnapshot.receive(json, now);
                    SnapshotStore.save(this, json); lastSave = now; DepartureWidget.updateAll(this);
                    ack(true); Toast.makeText(this, "ウィジェットへ保存しました", Toast.LENGTH_SHORT).show();
                } catch (IllegalArgumentException error) { ack(false); }
            });
        } else Toast.makeText(this, "Android System WebViewを更新するとウィジェット保存を利用できます", Toast.LENGTH_LONG).show();
        web.loadUrl(next.origin + "/");
    }
    private void ack(boolean ok) {
        if (trusted == null || !trusted.permits(web.getUrl())) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('maniauwidgetresult',{detail:{ok:" + ok + (ok ? "" : ",error:'保存できませんでした。アプリで情報を更新してください。'") + "}}))", null);
    }
    private void pinWidget() {
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        if (manager.isRequestPinAppWidgetSupported()) manager.requestPinAppWidget(new ComponentName(this, DepartureWidget.class), null, null);
        else Toast.makeText(this, "ホーム画面を長押ししてウィジェットから『まにあう』を選んでください", Toast.LENGTH_LONG).show();
    }
    private void backgroundDialog() {
        new AlertDialog.Builder(this).setTitle("バックグラウンドで徒歩時間を更新")
            .setMessage("開始すると常駐通知を表示し、このアプリを閉じている間も現在地から徒歩時間を更新します。位置は保存せず、経路検索先へ送信します。電池と通信を使用し、OSにより停止する場合があります。登録地点モードでは利用できません。")
            .setNeutralButton("閉じる", null)
            .setNegativeButton("停止", (d, w) -> { stopService(new Intent(this, WalkingUpdateService.class)); Toast.makeText(this, "背景更新を停止しました", Toast.LENGTH_SHORT).show(); })
            .setPositiveButton("開始", (d, w) -> requestBackgroundStart()).show();
    }
    private void requestBackgroundStart() {
        WidgetSnapshot snapshot = SnapshotStore.read(this);
        if (snapshot == null || snapshot.stationId == null || snapshot.selectedAt(System.currentTimeMillis()) == null) { Toast.makeText(this, "現在地モードで電車を選び、ウィジェットへ保存してください", Toast.LENGTH_LONG).show(); return; }
        java.util.ArrayList<String> needed = new java.util.ArrayList<>();
        if (!locationAllowed()) { needed.add(Manifest.permission.ACCESS_FINE_LOCATION); needed.add(Manifest.permission.ACCESS_COARSE_LOCATION); }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!needed.isEmpty()) { requestPermissions(needed.toArray(new String[0]), SERVICE_PERMISSION); return; }
        android.app.NotificationManager notifications = getSystemService(android.app.NotificationManager.class);
        android.app.NotificationChannel channel = notifications.getNotificationChannel("walking");
        if (!notifications.areNotificationsEnabled() || (channel != null && channel.getImportance() == android.app.NotificationManager.IMPORTANCE_NONE)) { Toast.makeText(this, "端末の設定から『まにあう』の通知を許可してください", Toast.LENGTH_LONG).show(); return; }
        if (visible) try { startForegroundService(new Intent(this, WalkingUpdateService.class)); } catch (RuntimeException error) { Toast.makeText(this, "背景更新を開始できません。位置情報の権限を確認してください", Toast.LENGTH_LONG).show(); }
    }
    private boolean locationAllowed() { return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED; }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == GEO_PERMISSION && pendingGeo != null) {
            pendingGeo.invoke(pendingGeoOrigin, visible && locationAllowed() && trusted != null && trusted.permits(web.getUrl()), false); pendingGeo = null; pendingGeoOrigin = null;
        }
        if (code == SERVICE_PERMISSION) {
            boolean notifications = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (locationAllowed() && notifications) { if (visible) requestBackgroundStart(); else resumeServiceStart = true; }
            else Toast.makeText(this, "背景更新には位置情報と通知の許可が必要です", Toast.LENGTH_LONG).show();
        }
    }
    private void denyPending() { if (pendingGeo != null) { pendingGeo.invoke(pendingGeoOrigin, false, false); pendingGeo = null; pendingGeoOrigin = null; } }
    private void openExternal(Uri uri) { try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (RuntimeException e) { Toast.makeText(this, "外部ブラウザを開けませんでした", Toast.LENGTH_SHORT).show(); } }
    @Override protected void onResume() { super.onResume(); visible = true; if (web != null) web.onResume(); DepartureWidget.updateAll(this); if (resumeServiceStart) { resumeServiceStart = false; requestBackgroundStart(); } }
    @Override protected void onPause() { visible = false; denyPending(); if (web != null) web.onPause(); super.onPause(); }
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { ++configurationGeneration; trusted = null; denyPending(); if (web != null) { web.stopLoading(); web.destroy(); web = null; } super.onDestroy(); }
}

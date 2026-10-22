# Android アプリとホーム画面ウィジェット

Webアプリを表示するネイティブ Android アプリと、Android の `AppWidgetProvider` を実装しています。PWA のホーム画面アイコンとは別のアプリです。Android 8.0（API 26）以降が対象です。

## 使い方

1. このディレクトリを Android Studio で開き、下記の手順で debug APK をビルドして端末へインストールします。
2. 「まにあう」を開くと接続先の入力画面が表示されます。初期値は利用者指定の `https://train-time-three.vercel.app/` です。「接続」を押します。HTTPS のトップ URL のみ設定でき、後から画面上部の「接続先」で変更できます。
3. アプリ内の Web 画面で駅・方面・乗りたい便を選び、現在地の更新、または登録地点の選択を行います。Web 画面のウィジェット保存操作で、選択した便と徒歩時間を端末内に保存します。
4. 上部の「ウィジェット追加」を押し、Android の確認画面で追加します。対応していないホームアプリでは、ホーム画面を長押し → ウィジェット → 「まにあう」から追加します。
5. ウィジェットの本体をタップするとアプリを開きます。「保存データで再計算」は、保存済みデータに現在時刻を適用します。徒歩経路や時刻表を新しく取得する操作ではありません。

選択した便がまだ発車前ならその便を表示し、発車済みなら保存されている次の便へ進みます。保存便は最大5本です。すべて発車済み、または時刻表期限切れならアプリでの更新を案内します。

表示する滞在目安は `発車時刻 − 徒歩時間 − 入口から乗車までの時間` です。別の乗車余裕時間は加算しません。徒歩時間が不明・期限切れの場合は滞在目安を表示しません。

## 任意のバックグラウンド更新

画面上部の「背景更新」→「開始」で利用者が明示的に開始します。既定は OFF です。

- 現在地モードで電車を保存してから開始します。登録地点モードでは開始できません。
- Android の位置情報権限と通知権限を求めます。常駐通知には停止ボタンがあります。アプリ上部の「背景更新」→「停止」でも停止できます。
- アプリが前面にある間に location 型 Foreground Service を開始し、そのセッションで位置情報を取得します。背景から勝手に起動する処理、端末再起動・プロセス終了後の自動再開、`ACCESS_BACKGROUND_LOCATION` の要求はありません。
- 緯度・経度はメモリ上でだけ扱い、設定した HTTPS オリジンの `/api/walking` に経路計算のため送信します。サーバーは既存の徒歩経路サービスを利用します。位置履歴・GPS値は端末の永続領域やログに保存しません。保存するのは徒歩分数と有効期限だけです。
- 誤差が100m以下かつ5分以内の位置だけを使います。経路上の道路への接続距離が両端とも30m以下と確認できた場合だけ徒歩判定を更新します。
- リクエストは同時1本、最短150秒。60m以上移動した場合、または前回から4分以上経過した場合に再計算します。端末側は24回/時までとし、Web画面の操作を含むサーバー全体の30回/時・120回/日の共有制限にも従います。失敗時は5分から最大20分の間隔を空けます。停止・再開始で端末側カウントは初期化されますが、サーバー共有制限は初期化されません。
- 徒歩時間を更新しても時刻表の取得日時 `generatedAt` は変更しません。GPS結果が古い、経路が不確定、上限到達の場合は古い値の有効期限を延長しません。
- 保存便がすべて発車済み、時刻表期限切れ、登録地点への切替時はサービスを停止します。最近使ったアプリ一覧からアプリを終了した場合も停止します。

Android の省電力設定、利用者による終了、権限変更、端末メーカーの制御により停止・遅延することがあります。GPSの常時稼働や一定周期での実行は保証しません。Android は通常のウィジェット定期更新を30分未満に設定できないため、分表示は「更新時点」と明記し、出発目安の絶対時刻・表示更新時刻・経路有効期限（月日と時分）を併記しています。徒歩期限・発車・時刻表期限には正確時刻権限が不要な AlarmManager の非厳密アラームで再描画を予約しますが、これもOSにより遅延します。常時秒単位で動くカウントダウンではありません。

## ビルド

必要な環境は JDK 17 以上、Android SDK Platform 35、対応する Build Tools、インターネット接続です。Gradle 8.11.1、Android Gradle Plugin 8.9.2、AndroidX WebKit 1.12.1 を固定しています。

Android Studio では `native/android` をプロジェクトとして開き、SDK Manager で Platform 35 を用意し、必要なライセンスを内容確認のうえ利用者自身で承諾してください。本実装ではライセンスの自動承諾を行っていません。

Windows PowerShell:

```powershell
cd native/android
.\test-logic.ps1
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

macOS / Linux:

```sh
cd native/android
sh test-logic.sh
bash gradlew --no-daemon :app:assembleDebug :app:lintDebug
```

SDK の場所が自動検出されない場合は Android Studio で作成される `local.properties` の `sdk.dir`、または `ANDROID_HOME` を設定します。`local.properties` は Git 対象外です。

成果物は `app/build/outputs/apk/debug/app-debug.apk` です。debug APK は開発用署名であり、Play Store の配布や公開用署名を行ったものではありません。インストールは Android Studio の Run、または USB デバッグを利用者が有効化した端末に `adb install -r app/build/outputs/apk/debug/app-debug.apk` を使用します。

`gradlew`、`gradlew.bat`、wrapper JAR は [Gradle の公式 v8.11.1 タグ](https://github.com/gradle/gradle/tree/v8.11.1) から取得しています。wrapper JAR の SHA256 は `2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`、配布 ZIP は `f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6` です。取得時に公式配布元のチェックサムと照合し、配布 ZIP の検証値を wrapper 設定に指定しています。

## データ・セキュリティ境界

- `window.ManiauWidget.postMessage(JSON文字列)` が保存入口です。保存結果は Web 画面の `maniauwidgetresult` イベント `{detail:{ok:true}}`、または `{detail:{ok:false,error:'...'}}` で通知します。
- AndroidX WebKit の origin 指定メッセージリスナーを使用し、設定した HTTPS オリジンの main frame からの要求だけを受理します。保存データを読み出す API はありません。対応していない Android System WebView では保存機能を無効にして更新を案内します。
- 32KiB、最大5便、厳密な型・キー・件数・時刻順序・重複・日付と発車時刻の整合・有効期限を検証します。日付処理は Asia/Tokyo です。00時台と24時台の運行日表現を扱います。
- 外部への WebView ナビゲーションは開かず、利用者が押した HTTPS 外部リンクは外部ブラウザで開きます。埋め込みの外部通信、file/contentアクセス、平文HTTP、mixed content、第三者Cookieを無効にしています。
- URL変更時は旧スナップショット、WebStorage、Cookie、位置許可を消去し、背景更新を停止します。バックアップは無効です。接続先を保存・変更する操作はネイティブ画面でのみ可能です。
- 保存JSONの共有仕様は schemaVersion 1。`speedKmh` と `routingTarget:{stationId,entranceId}|null` を含み、`routeUpdatedAt` は null またはミリ秒。位置座標はスナップショットに含めません。位置の代わりに `originLabel` を表示します。

## 検証と未検証

2026-10-22 の Windows 環境で、JDK 21 を使い `--release 17` による純粋Java部分のコンパイルと **77件のチェック**を実行し、すべて成功しました。選択便、発車直前、終電後、期限切れ、日付またぎ、不正JSON、origin制限、GPS精度・鮮度、同時実行・最短間隔・移動量・再試行・時間上限を含みます。Android Manifest と全 resource XML の構文解析も成功しています。

このローカル環境に Android SDK と Android 実機はなく、APK全体のコンパイル、端末のWebViewブリッジ、位置許可画面、ウィジェット実画面、背景GPSの省電力下動作はローカルでは未検証です。Gradle wrapper の `--version` 起動は成功し、`:app:assembleDebug` は `SDK location not found` で停止しました。CIによるAPKビルド結果はリポジトリ側の検証記録を確認してください。Javaロジックの成功を実機動作確認と同一には扱いません。

実機では、保存ACK、選択便の更新、ホーム追加、タップ起動、現在地拒否、概算位置、背景開始・通知停止、画面ロック、GPS無効化、省電力、アプリ終了、日付またぎ、期限切れを確認してください。Google Play 登録、公開、リリース署名、料金契約は行っていません。

## 公式資料

- [AGP 8.9 の Gradle / JDK 互換](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
- [WebViewCompat の origin 制限メッセージAPI](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [WebView native bridge の安全対策](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
- [ウィジェット更新間隔](https://developer.android.com/develop/ui/views/appwidgets/advanced)
- [Foreground Service を前面から起動する制約](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [location Foreground Service の権限](https://developer.android.com/about/versions/14/changes/fgs-types-required)

## SDK付きCIで生成した開発版APK

2026-10-22、[CI run 39740393462](https://github.com/AMZ-jpcslr/train_time/actions/runs/39740393462)でJavaチェック77件、assembleDebug、lintDebugが成功しました。[APK artifact](https://github.com/AMZ-jpcslr/train_time/actions/runs/39740393462/artifacts/12409305407)をGitHubにログインしてダウンロードし、ZIP内の`app-debug.apk`をAndroidへ転送できます。このartifactの保存期限は2026-10-29です。その後は新しいCI実行または手元のSDKで再ビルドしてください。端末へのインストール・ウィジェット実画面・背景GPSは未検証です。詳しい結果は[検証記録](../../docs/mobile-widgets-verification.md)にあります。

# 列車選択・スマートフォンUI・ウィジェット・共有表示

2026-10-22実装。公開URLは`https://train-time-three.vercel.app/`。Vercelの設定やアカウントの変更、ストア公開は実施しない。

## Webの変更

- 次の5本すべてを選択可能にし、各行に現在地／登録地点の残り滞在時間を表示。便の選択で経路APIを呼び直さない。
- 先の便を選択したまま先発が発車しても選択を維持。選択便発車・対象変更・時刻表更新による消失を通知し解除。
- 式は`発車予定 − 現在 − 徒歩 − 入口からホームまで`。既定3分の構内時間に乗車余裕を含め、別枠の加算と設定項目を削除。旧保存値は移行時に無視。
- 駅・入口・登録地点を独自の選択ダイアログへ統一。検索、矢印/Home/End/Enter/Escape、フォーカストラップ・復帰に対応。
- スマートフォンの入力欄は16px、主要操作は44px以上。現在地取得は先頭の位置情報パネル。
- ホーム画面追加の案内。Androidのインストールイベントは明示クリックまで待機し、プロンプト受理とインストール完了を区別。iPhoneはSafariの共有メニュー手順。

`frontend-design`のindustrial/utilitarian方向でレビューした。既存の黒・ライム、Zen Kaku Gothic NewとBarlow Condensedを維持。DFII評価15、タッチ操作と選択便を優先。320pxと390pxの列車一覧・ウィジェット説明を目視し横溢れを確認。画像は個人の連絡先を含み得るため`docs/screenshots/`にローカル保存。

## ウィジェットの使い方と範囲

1. [Android](../native/android/README.md)／[iPhone](../native/ios/README.md)の専用アプリをビルドして端末に入れる。PWAのホーム画面追加とは別。
2. 接続先URLを確認しWeb画面で駅・方面・列車・徒歩時間を選ぶ。
3. 「選んだ電車をウィジェットに保存」を押し、保存完了を確認する。
4. ホーム画面で「まにあう」のウィジェットを追加する。
5. 現在地からの背景更新を使う場合はアプリ本体の設定でON。位置権限と停止手段を用意し、起動時の既定はOFF。

共通snapshot schema1は32KiB以内。最大5便、予定発車時刻、選択ID、出発地点ラベル、徒歩分、構内分、歩行速度、入口ID、運行日、保存日時、時刻表期限、徒歩期限を保存する。座標・経路形状・GPS履歴は保存しない。

時刻表期限は保存から最大6時間、元の再確認期限（JR6時間／他30日）、運行日の翌04:00の最短。現在地の徒歩期限は位置取得+5分・経路取得+10分・時刻表期限の最短。登録地点の実測徒歩時間は時刻表期限まで。道路への接続区間30m超、位置精度100m超、古い位置は滞在時間の算定に使わない。

Androidは更新時点の残り時間と絶対時刻・期限を併記し、非厳密アラームで期限の再描画を予約する。iPhoneは動的タイマーと期限のtimelineを使用。どちらもOSが再描画時刻を調整するので、表示の遅れや常時動作を保証しない。保存した全便の発車後や時刻表期限後にはWeb画面で新しい便を保存する。**ネイティブ側で日々の時刻表を独立取得する機能はまだない。**

## 背景更新と無料API

Androidは利用者がアプリを開いて開始した位置情報foreground serviceを使い、常駐通知・停止操作を表示する。iPhoneは使用中→常にの段階的許可とLocation background modeを使う。背景更新は利用者のON操作が必要で、アプリ再起動後はOFF、端末再起動・プロセス終了後に自動復活させない。保存便終了・時刻表期限・登録地点モードでは停止する。

徒歩APIは最短150秒間隔、移動60mまたは約4分を目安に更新し、同時1本・失敗バックオフを適用する。すべての利用者とWeb画面が既存の30回/時・120回/日の外部取得上限を共有するため、継続的な背景利用では上限に達する。これは無料の少人数試用構成であり、上限を緩めたり有料APIを契約したりしていない。取得失敗時は元の期限を延長せず、期限切れの徒歩判定を停止する。

## URL共有

`vite.config.ts`のHTML変換で`og:title/type/url/image/description`、画像寸法・代替文、Twitter large-image、canonical、descriptionを配信HTMLへ挿入。React起動やGPS取得は不要。優先順は`APP_ORIGIN` → `VERCEL_PROJECT_PRODUCTION_URL` → `https://train-time-three.vercel.app`。明示URLはHTTPSのoriginのみ（ローカルテストのloopback HTTPは許容）、資格情報・path・query/hash・制御文字を拒否する。環境変数全体をクライアントへ渡さない。

`public/og-image.png`は独自デザインの1200×630の静的紹介画像。事業者のロゴ・画面・画像を転用せず、利用者の位置情報を含めない。再生成は`node scripts/render-social-card.mjs`。通常のbuildは同梱PNGをコピーするだけ。

公開後はページHTMLと`/og-image.png`が認証不要・200で取得できることを確認する。共有先がリンクカードに対応すること、古いURLのキャッシュが再取得されることも表示条件になる。すべての送信先のアプリで画像表示されることまでは制御できない。[Open Graph protocol](https://ogp.me/)、[Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)。

## 検証の境界

Webの単体/E2E/PWA、Android純粋Java、iOSプロジェクト構造は別々に確認する。結果は[検証記録](mobile-widgets-verification.md)。ブラウザのGeolocationと経路APIを固定応答にしたテストは利用者の実GPSの試験ではない。Android/iPhoneの実機、バックグラウンドでの継続動作・OS権限ダイアログ、iOSのSwiftコンパイルとXCTestは未検証。iPhone版の導入にはMac/Xcodeと利用者による署名設定が必要で、Appleへの登録・課金・配布を代行していない。

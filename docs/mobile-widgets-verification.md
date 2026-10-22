# スマートフォンUI・列車選択・ウィジェット・共有表示の検証

2026-10-22、Windows / Node.js 24.21.0。変更前commitは`8d40c6207900294259e3ee62944025a466e73928`。利用者本人の位置を取得していない。テスト中のGPSと経路応答は固定fixture、時刻表は保存済み正規化実データを使用。

|確認|結果|範囲|
|---|---|---|
|`npm test`|274/274成功、20ファイル|元の解析/日付/経路テストに加え、余裕時間移行、17件のsnapshot境界、32件の共有メタ検証・6件の不正経路origin検証|
|`npx playwright test --workers=1`|76/76成功、追加修正後のwidget 8/8成功|PC/スマートフォン、全5便の滞在時間と選択、選択便発車・方面/プレビュー切替、独自選択UI、PWAインストール案内、native ACK成功/失敗/timeout|
|実Web出力→Android受信|成功|今出川5便・3本目選択・徒歩1分の実ブラウザ出力を`SnapshotContractCheck`で受理。座標が含まれないことも確認|
|`npx playwright test --config=playwright.pwa.config.ts --workers=1`|1/1成功|更新後buildのService Worker、オフライン起動、保存JR期限切れ|
|`npm run build`|成功|TypeScript、Vite、PWA11アセット。時刻表同梱による500kB超chunk警告あり|
|`npm run check:package`|成功|Function追跡373ファイル/4,583,027 bytes。秘密・テスト資料除外、未設定徒歩接続停止|
|Android純粋Java|77チェック成功|Java17対象のコンパイル、入力/期限/選択/日またぎ/背景更新頻度/抑制|
|AndroidローカルAPK|SDK不足で未完了|wrapper起動成功、assembleDebugは`SDK location not found`。SDK導入/ライセンス承諾は代行せず|
|iOS構造|成功|62project objects、全参照・plist・entitlements・scheme・fixture日時。21 XCTestメソッドの存在を確認|
|iOS compile/XCTest|未実行|WindowsにSwift/Xcodeなし。テスト実装数を成功数へ計上しない|
|共有HTML/画像（ローカルbuild）|成功|HTMLに絶対OG URL/description/Twitter、PNG200 image/png・1200×630|
|公開先変更前の取得|200、OG/descriptionなし|利用者指定`https://train-time-three.vercel.app/`を読み取り、追加前の状態を確認|

画面画像は`docs/screenshots/mobile-train-list-review.png`、`mobile-320-train-list-review.png`、`mobile-selected-train-review.png`、`mobile-widget-transfer-review.png`等。320/390pxで横溢れなし。画像・個人の連絡先を含み得る原資料はGit対象外。共有用PNGは独自の静的紹介画像で個人情報を含まない。

セキュリティレビューは[別記](widget-security-review-20261022.md)。Androidのorigin切替中の旧bridge失効、iOSの時刻整合・clockrollback・検証済みデータのみ保存、背景経路のorigin/fetchedAt照合と三重期限を修正。

残る実機確認：Androidの権限ダイアログ・WebView・AppWidget・常駐通知・画面ロック下GPS、iPhoneのビルド・署名・WidgetKit・Always許可・背景GPS、省電力/強制終了時の動作。ネイティブは保存した最大5便を表示し、自律的な毎日の時刻表取得は未実装。PWAのみでOSのネイティブウィジェットや常時GPSを提供することはできない。

GitHub CIのAndroid SDK付きビルドと公開先の反映結果は以下。

## GitHubと公開先の確認

機能追加commit `abc5a39650307fee2285bfd3f97d377263daaba5` をmainへpush。 [GitHub CI](https://github.com/AMZ-jpcslr/train_time/actions/runs/39740104629) のAndroidジョブでJavaテスト・APK assembleDebug・lintDebug・APK artifact保存が成功した。ローカルSDK不足とは区別して、SDK付きUbuntuでコンパイル確認できた。実機のインストールやGPS確認はまだ行っていない。

2026-10-22 16:24 JST、公開URLのHTML・description・OG/Twitterタグと `/og-image.png`（200/image/png/1200×630）を読み取り確認した。[取得結果](public-sharing-verification.json)。Vercel設定・手動デプロイは操作していない。LINE等のアプリ自身のプレビュー表示・キャッシュ更新は未検証。
最終の実装commit `49d319eb5467a7ebdb2ab142f872308372726407` の[CI](https://github.com/AMZ-jpcslr/train_time/actions/runs/39740393462)は、2026-10-22 16:30 JSTに全ジョブ成功を確認。Web単体274件、PC/mobile E2E78件、PWA1件、build/package検査、Android77チェック・APKビルド・Lintが成功した。[CI結果](widget-ci-verification.json)。公開配信のJSファイル名もローカル最終buildと一致した。

Androidの[開発版APK artifact](https://github.com/AMZ-jpcslr/train_time/actions/runs/39740393462/artifacts/12409305407)は2026-10-29まで保持。GitHubへのログインが必要。ZIP内の`app-debug.apk`は1,188,888 bytes、SHA256 `a689f8268c2657a3d5b8d94761e8a89df956c602ccccd7e73f1dabc772512f57`。ローカルにも`.cache/verification/maniau-debug-49d319e.apk`として保存した。開発署名による試用APKで、ストア配布版ではない。
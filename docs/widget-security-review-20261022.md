# ウィジェット・共有プレビュー追加のセキュリティレビュー

確認日: 2026-10-22。`backend-security-coder` スキルに沿い、新規のWeb→ネイティブ保存、任意の背景位置更新、共有URL用メタデータを確認した記録です。既存バックエンドのレビューは [backend-security-review-20261022.md](backend-security-review-20261022.md) を参照してください。

## 対象と検証境界

- `src/domain/widget.ts`、`src/WidgetTransfer.tsx`、`scripts/social-metadata.mjs`、`vite.config.ts`。
- `native/android` の保存ブリッジ、入力検証、保存先、背景位置サービス、経路応答と更新間隔。
- `native/ios` のWKWebViewブリッジ、共有スナップショット、App Group保存、背景位置更新、WidgetKitの有効期限処理。

信頼する送信元は利用者がネイティブ設定画面で指定したHTTPS originです。そのorigin自体の侵害を防ぐ認証基盤を追加したものではありません。外部iframe、接続先変更後の旧ページ、型や期限が不正なデータを保存境界で除外することを確認しました。

## 指摘と対応

| 指摘 | 影響と再現条件 | 対応状況 |
| --- | --- | --- |
| Androidの接続先変更時に旧ブリッジが短時間残る | 保存origin変更後、非同期Cookie削除が完了するまで旧documentからのメッセージが新しい保存領域を更新できる | 修正済み。設定変更の先頭で信頼originを無効化しlistenerを除去。非同期callbackは設定世代・現在origin・WebView存続を検証する |
| iOSの接続先変更時に旧Coordinatorが短時間残る | SwiftUIによる旧WebView破棄の前に、旧originのqueued messageで消去済みsnapshotを再保存できる | 修正済み。受信ごとに現在の設定originとCoordinatorのoriginを比較し、アプリが前面にある場合だけ受け付ける |
| iOSの発車時刻・運行日・期限の相互検証不足 | 各フィールドの形式が正しくても、表示時刻とepochが異なる便や期限外の便を受理する。時計を戻すと未来のsnapshotが有効に見える | 修正済み。Asia/Tokyo運行日、00時台/24時台とepoch、生成時刻範囲、発車の上限期限、240分の徒歩上限を検証。30秒を超える時計巻戻しは期限外表示 |
| iOSの保存に生JSONが残る | 重複した親キーで無視されるデータがあると、検証した値に含まれない情報も元JSONのまま永続化される | 修正済み。検証済み型の`canonicalData()`を保存し、生JSONを破棄。必須nullを明示し、decode後の便数も検証する |

根拠となる変更箇所は [Android MainActivity](../native/android/app/src/main/java/jp/maniau/widget/MainActivity.java)、[iOS TrainWebView](../native/ios/App/TrainWebView.swift)、[iOS WidgetSnapshot](../native/ios/Shared/WidgetSnapshot.swift)、[iOS SnapshotStore](../native/ios/Shared/SnapshotStore.swift) です。上記4件の修正を再読し、指摘に対応したコードが保存されていることを確認しました。ネイティブOS上での動作確認は下記の未検証範囲です。

## 確認できた保護

- Webからの保存は利用者のボタン操作によって行い、ネイティブからのACKを受けるまでは成功と表示しない。失敗・5秒タイムアウトを成功扱いしない。
- AndroidはAndroidX WebKitのorigin制限付きメッセージAPI、iOSはWKScriptMessageのsecurityOriginとmain frameを検証する。任意のサイトに公開するJavaScriptインターフェースを使わない。
- 保存は32KiB、最大5便、明示したフィールドに限定する。Webの送信データに現在地の緯度経度・経路形状・余裕時間の旧設定を含めない。
- 背景更新は既定OFFで利用者が開始する。Androidは常駐通知と停止ボタン、iOSは段階的な位置権限とOFF操作を持つ。登録地点の実測時間は背景GPSの対象外。
- 背景通信は設定済みHTTPS originの`/api/walking`へPOSTし、リダイレクトを拒否、応答は2MiBまで。1件ずつ、最短150秒、移動量・経過時間・失敗時待機で制限する。サーバー側の共通回数制限も適用される。
- 経路の入口ID、要求座標との一致、取得時刻、有限な距離/時間、両端30m以内の道路接続を確認する。位置の精度100m・鮮度5分を超えた情報で徒歩判定を更新しない。
- 背景更新で時刻表の生成時刻を更新しない。徒歩情報の期限は位置・経路・時刻表の最短の期限とする。通信失敗で旧情報の期限を延ばさない。
- Androidの保存領域はprivateでバックアップ無効。iOSはApp Groupへ原子的に書き、端末の初回ロック解除までファイル保護する。座標履歴を保存するコード、座標やsnapshotのログ出力は追加していない。
- 共有プレビューはサーバーが返すHTMLへ挿入する。URLはoriginのみ、HTTPS（開発時loopbackのみHTTP）、認証情報・query・fragment・制御文字を拒否し、属性値をescapeする。Viteの環境変数全体をクライアントへ出力しない。画像は固定の紹介画像で利用者の現在地を含めない。

## 実行した確認

```powershell
npm test -- --run tests/widget.test.ts tests/social-metadata.test.ts
& native/android/test-logic.ps1
python native/ios/scripts/check_project.py
```

レビュー時点でWeb単体テスト49件、Android純粋Javaチェック77件が成功しました。iOSの62件のプロジェクト参照・plist・fixture整合のチェックも成功しました。iOSのXCTestメソッドは21件存在しますが、このWindows環境では実行していません。

ネイティブの権限画面、WebView実ブリッジ、OSの背景実行、画面ロック・省電力時の停止、WidgetKit/Androidホーム画面への描画は実機検証の対象です。このレビューとJavaの成功を、実機動作やSwiftコンパイルの成功とは扱いません。最終の全テスト・ビルド結果はREADMEの検証記録を参照してください。

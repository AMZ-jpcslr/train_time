# GitHub・Vercelへの反映確認

## B案・神戸データの公開

2026-10-26。利用者から今回のGitHubアップロード・Vercel反映の指示を受け、既存の公開リポジトリとmain連携を使用した。新規プロジェクト、契約、ストレージ、環境変数は作っていない。

- データ：`70a2081`（神戸の検査済み追加・取得証拠・対応一覧）。
- UI：`685ee4489fe75cbb1cbd82e4aa40e573ce503c3b`（選定済みB、文言、SEO、API設定の境界）。
- GitHub：[AMZ-jpcslr/train_time](https://github.com/AMZ-jpcslr/train_time)。mainへのpush成功。
- Vercel：[デプロイ](https://vercel.com/amz-jpcslr/train-time/6sVzZ8tAt91F29xEukcKfcEcen6b)はsuccess。公開先は [まにあう](https://train-time-three.vercel.app/)。

2026-10-26 13:32 JSTの取得で、配信JS `/assets/index-D3Eo7IRL.js`（3,852,642 B）とCSS `/assets/index-ChS3V7OK.css`（72,090 B）の全バイトが検証済みローカルビルドと一致した。JS SHA-256は `3b2c555a16381fe93feba387d4b53f9d61a7705f3f1ff9b09b14e0032c891b68`。Service Workerは `mania-u-v2-f35c848ecf0a` を配信し、新しいJSをキャッシュ一覧に含む。

配信HTMLの構造化データ・canonical、robots・sitemap、公開APIの設定有効を確認した。本番の新規ブラウザーで中央市場前の平日東行、未対応の西行、駅お気に入りと再読込、GPSなしでは計算しない状態を確認し、pageerrorは0件。初回の本番操作スクリプトは方面ボタンの矢印を含む名前を考慮せずタイムアウトしたため、対象の方面ボタンを指定する検査へ修正し、再実行成功。製品の処理はこの修正で変更していない。

証拠は `.cache/release-review-20261026T124436/production-verification.json`、画像は `docs/screenshots/release-review-20261026/production-mobile.png`。本番確認で個人の既存ブラウザー保存を操作していない。

## GitHub Actionsの境界

[UIコミットのCheck実行](https://github.com/AMZ-jpcslr/train_time/actions/runs/40269196620)では、単体・型検査・ビルド・serverless package・通常E2E（132成功、6スキップ）とAndroidの検査・ビルド・lintが成功した。interactionsは26成功、3スキップ、touch-390の1件が失敗し、後続のlayout/PWAはスキップされた。したがってこのCI全体は成功していない。

失敗は逆向きスワイプ後のsnap中に明示ジャンプを押す試験で、カード位置が期待から9pxずれたもの。診断traceに基づき、一度だけ戻り位置を補正する修正を追加した。[原因と再検証](timeline-touch-return-fix-20261026.md)。ローカルの従前PWA8件・通常E2Eの個別成功はこのCIの成功と混同しない。途中の全体layout/interactionsはツールセッション消失により最終結果を回収できず、未完了として記録。その後、layout全体を再実行し18/18成功を確認した。

## JR検索台帳・タッチ戻り修正の公開

上記の公開確認後、無料で条件が明確な範囲を続け、問い合わせは送らない利用者の方針に従ってJR駅検索台帳を追加した。

- データと取得対象の宣言：`1d2e923`。
- UIの未対応表示とタッチ戻り修正：`7d9c0196d4db2ee2148d524b78a903ab7413867f`。
- [Vercelデプロイ](https://vercel.com/amz-jpcslr/train-time/3QP2zFvu1iWP6nkXXKYDhwdQ6eCU)：success。
- 配信確認：2026-10-26 14:22 JST。JS `/assets/index-DB2AgfuZ.js`（3,926,645 B）、CSS `/assets/index-DquGWJsQ.css`（72,787 B）は最終ローカルビルドと全バイト一致。JS SHA-256 `a9763daa84d68f7a60069f3e2c91c5aea62ba3893a79e681c7dfbe44a9dd5e44`。
- Service Worker：`mania-u-v2-8c5b67f8a35a`。新しいJS、metadata、PWAを確認。

本番390pxで、中央市場前の有効な平日東行と欠けた西行を区別したまま、新しいJR高槻を検索・選択・お気に入り保存・再読込できた。新駅は時刻表未対応として表示し、GPSや徒歩入力・列車カード・架空時刻を表示せず、JR時刻表APIへの要求は0件。JR公式で時刻表を探すリンクが初画面内にあることを確認した。pageerrorは0件。既存4駅のAPIも再確認し、HTTP 200で8表・1,702発車、対象駅不変だった。

追加駅の本番320/390/1280pxで横はみ出し0、主要リンク・ボタンは高さ48px以上。320pxで全テキストを200%にしても横はみ出しなし。下部ナビ高131.375pxに対し末尾余白182pxを確認。最初の追加計測スクリプトはJavaScript内にTypeScriptの型引数を残して実行時に停止したため、それを除いた後に再実行した。製品コードはこの訂正で変更していない。

証拠は `.cache/release-review-20261026T124436/production-verification-7d9c019.json`、`jr-production-after-scope.json`、`catalog-responsive-production.json`。画像は `docs/screenshots/jr-catalog-20261026/production-takatsuki-mobile.png` と `production-320-text-200.png`。

ローカルの最終結果は単体486件、JR関連の画面回帰28件、未対応画面の整頓後4件、PWA9件、layout18件成功。型検査・ビルド・386ファイルのserverless packageも成功。タッチ修正のChromium14件・WebKit固定再現1件は成功した。一方、その時点のWebKit smooth試験は中間フレーム採取数不足で失敗した（scrollendを外した対照でも同じ、最終整列は成功）。その結果は取り消さず、下記の測定方法の変更と分けて記録する。実ユーザーテストや実機屋外確認は行っていない。

[製品修正7d9c019のGitHub Actions](https://github.com/AMZ-jpcslr/train_time/actions/runs/40273577630)は全体では失敗。単体・型検査・ビルド・package・通常E2E（136成功、6スキップ）・Android・layout18件・PWA9件は成功。interactionsは46成功、3スキップ、WebKit320の中間フレーム採取数1件が失敗した。固定再現を追加したタッチ戻りの試験は成功した。

## スクロール同期試験の測定方法

`d684108ee22b25674edd259dc1634cfc1e9e2743`では試験と診断記録だけを変更し、製品runtimeは7d9c019と同一。任意の中間フレーム数ではなく、実際の図のstyle更新後にnative scrollLeftと同じ列車アイコンの位置を同時に測る。隣接するカードとアイコンの実配置から期待位置を計算し、途中の更新があること、各更新・最終位置の誤差1 CSS px以下、方向・選択便・出発目安が正しいことを検査する。凍結・逆向き・途中更新欠落の測定列を拒否する負例も含む。[測定と再試行の詳細](timeline-touch-return-fix-20261026.md)。

ローカルの2回目はChromium320/390、WebKit320/390/1280の5構成すべて成功。最大同期誤差は0.000051 CSS px以下。初回は4構成成功、Chromium390が画面読み込み中にタイムアウトし、操作前の失敗として保持した。型検査も成功。

[d684108のGitHub Actions](https://github.com/AMZ-jpcslr/train_time/actions/runs/40277066797)では新しい同期試験は全構成成功した。一方、touch390の実swipe後の戻り位置が再び9px残り、interactionsは46成功・3スキップ・1失敗、全体では失敗した。7d9c019の一度だけの補正ではnative snapとの競合を取り切れていない。単体486・通常E2E136成功/6スキップ・layout18・PWA9、型検査・ビルド・package・Androidは成功。固定raceの検査だけの成功をもって再発なしとは扱わない。

Vercelは[デプロイ成功](https://vercel.com/amz-jpcslr/train-time/9QxSJHngrKbt6zhVaXmGe5osCFiy)。2026-10-26 15:04 JSTの再取得でも配信JS/CSSは上記7d9c019のハッシュ・サイズと一致した。この時点では実操作の9px競合が残り、追加の診断と修正を継続した。

## 残存snapの追加修正と本番確認

`3c082a78f0ea9262b4796c0e8c9510f346ef2f58`で追加修正を公開した。ローカルの自然スワイプで、scrollend内の旧補正の次の描画にcompositor snapが4px再上書きする順序を観測し、同期ハンドラー内の補正を2 rAF後の単発補正へ移した。待ち中の新しい入力・別ジャンプ・駅/方面変更・画面破棄で取り消す。新fixtureは旧コードで4px残留により失敗し、修正後のChromium320/390・WebKit390の15件が成功。自然CDP試験4件も成功したが、競合が発生した回数とは扱わない。初回の取消し検査1件の時間切れは担当記録に保持した。

本番ビルド（型検査を含む）・serverless packageは成功。386ファイル、5,978,869 B、秘密情報の除外、未設定時の外部取得停止を確認した。JSは3,926.77kB/gzip342.21kBとなり、500kB超chunkの警告は残る。

[Vercelデプロイ](https://vercel.com/amz-jpcslr/train-time/87g5RHLewuUGmsrDeGJ8BfYjYwDV)はsuccess。2026-10-26 15:27 JSTに公開JS `/assets/index-CrkOAgGf.js`（3,926,769 B、SHA-256 `9275c476397f93300f92d99efb83d32e66e53e536ac3c787dcaf2af715471f44`）とCSS `/assets/index-DquGWJsQ.css`（72,787 B）がローカル最終ビルドと全バイト一致した。Service Workerは `mania-u-v2-b6dadd06d251`。metadata・robots・sitemap・新JSのPWA登録も確認した。

本番の新規390pxブラウザーで、海岸線平日東行と未取得の西行、GPSなしでの計算停止、お気に入り再読込、JR高槻の検索・駅だけのお気に入り・時刻表未対応・公式リンク・JR取得要求0件を再確認した。pageerrorは0件。別の本番CDP試験でも320/390pxの実スワイプ・戻る操作が2/2成功（16.97秒）し、選択便と出発目安が保持された。固定日時・架空の実測地点を使う自動ブラウザー検査で、GPS・歩行・実利用者テストではない。本番CDPではAPI時刻表をモックしていない。

証拠は `.cache/release-review-20261026T124436/production-verification-3c082a7.json`、`production-native-touch.json`、`build-after-late-snap.log`、`package-after-late-snap.log`。追加画像は `production-mobile-after-late-snap.png` と `production-takatsuki-mobile-after-late-snap.png`。以前の画像・失敗記録は残した。

[3c082a7の最終GitHub Actions](https://github.com/AMZ-jpcslr/train_time/actions/runs/40279767226)は2026-10-26 15:38 JSTまでにtest/androidの両ジョブがsuccessで完了した。再実行で成功したのではなく、追加修正コミットに対する初回実行の結果である。

|検査|最終結果|
|---|---|
|単体|486/486成功、39ファイル、失敗なし|
|型検査・本番ビルド・package|すべて成功。chunkサイズの警告は継続|
|通常E2E|136成功、6スキップ、失敗なし|
|タッチ・WebKit操作|52成功、3スキップ、失敗なし|
|狭い画面・文字拡大|18/18成功|
|オフラインPWA|9/9成功|
|Android|pure Java 79件、assembleDebug、lintDebug成功|

通常E2Eのスキップはレビュー画像の明示実行とLinuxで実行できないWindows DPAPI統合、タッチの3スキップはWebKitにCDPタッチ注入APIがないため。WebKitのボタン・キーボード・同期・固定race・レイアウトは別に実行した。スキップを成功数に含めない。以前のEPERMで未確認だった11件を過去のまま成功へ数え替えず、今回の486件を新たな実行結果として記録する。

以前の3回のCI失敗、ローカルの初回時間切れ、測定方法の変更、最終整列だけでは未実行だったassertは上記・担当記録に残す。最終successをもって過去の全試行が成功したとは説明しない。実ユーザーの判断秒数・押し間違い率、実機の屋外視認性・現地GPS歩行、未取得の京都CSV/海岸線27表/JR新駅時刻表の検査は未実施のまま。

最終CI確認後の追記はREADMEとMarkdownの記録だけで、製品・試験・データ・設定は変更しない。この文書のみの保存コミットは `[skip ci]` を付け、コードの最終検証対象は明示した3c082a7とする。

## 公開対象と保全

単体・ブラウザーCIは各リンク先コミットの登録内容に対する結果であり、後から作成された未追跡のUI試作一式を含めない。今回の公開対象は検証したデータ・通常B画面・関連試験・記録に限定する。旧神戸生成物4ファイルや、別途作業中の未追跡ファイルはそのまま残し、まとめて登録しない。

作業開始前からあったpackage.json/package-lock.jsonと旧神戸生成物4ファイルの計6ファイルは、開始時のSHA-256と再照合してすべて一致した。記録は `.cache/release-review-20261026T124436/original-preservation-final.json`。データとUIは別コミットで追跡でき、取得キャッシュ・認証情報・全国ZIP・JR公式PDF画像は公開成果物に追加していない。

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

失敗は逆向きスワイプ後のsnap中に明示ジャンプを押す試験で、カード位置が期待から9pxずれたもの。診断traceを取得し、修正と再検証を継続している。ローカルの従前PWA8件・通常E2Eの個別成功はこのCIの成功と混同しない。ローカルで追加実行した全体layout/interactionsはツールセッション消失により最終結果を回収できず、未完了として記録している。

JRの無料駅検索台帳はこの公開確認の後に着手した。追加分の公開確認とsnap修正の最終結果は追記する。

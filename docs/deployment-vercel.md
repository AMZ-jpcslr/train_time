# Vercel公開手順

既存の公開先は [まにあう](https://train-time-three.vercel.app/)、GitHubは [AMZ-jpcslr/train_time](https://github.com/AMZ-jpcslr/train_time)（公開）です。mainの更新を既存のVercel連携が取り込みます。2026-10-26の改修前確認ではページと `/api/config` がHTTP 200で応答し、JR取得・徒歩計算の設定が有効でした。新しい変更の配信成功は、push後に配信されたファイルとPWA更新番号を照合して別途確認します。

以下は別環境へ新規に設置する場合の手順です。プロジェクトやデータベースの新規作成、契約、環境変数の登録は既存環境の更新には不要です。過去のローカル検証は [配信構成の検証](deployment-verification.md) に保持しています。

## 1. GitHubから取り込む

Vercelの **Add New → Project → Import Git Repository** で [AMZ-jpcslr/train_time](https://github.com/AMZ-jpcslr/train_time) を選択する。表示されないときはVercelのGitHub連携でこのリポジトリへのアクセスを確認する。

|項目|設定|
|---|---|
|Production Branch|`main`|
|Root Directory|リポジトリ直下 `.`|
|Framework Preset|Vite|
|Node.js Version|24.x|
|Install Command|`npm ci`|
|Build Command|`npm run build`|
|Output Directory|`dist`|

`vercel.json` を同梱している。Viteのフロントと `api/index.mjs` のNode Functionを同じプロジェクトに配置し、`/api/config`、`/api/jr`、`/api/walking` をFunctionへ転送する。既存のローカル `npm run dev` / `npm run preview` はそのまま使える。

Vercel Functionは複数インスタンスへ増えるため、ローカルディスクやメモリーだけでは共有回数制限にならない。クラウドではRedisに日別時刻表キャッシュと全体制限を保存する。原HTMLの一時処理は `/tmp` 相当の領域に限定し、アプリの配置ディレクトリへ書き込まない。[Vercel Node Runtime](https://vercel.com/docs/functions/runtimes/node-js)、[実行時間等の制限](https://vercel.com/docs/functions/limitations)

## 2. Redisを接続する

Vercel Marketplace / StorageからUpstash Redisを接続するか、既存のUpstash互換Redis RESTエンドポイントを使う。新しいサービスをこちらから作成したり、有料プランへ切り替えたりはしていない。

2026-10-22の[Upstash公式料金](https://upstash.com/pricing/redis)ではFreeは月額0ドル、256MB、月50万コマンド。実際の作成画面でFreeを選び、従量課金への変更を確認する。無料枠はアクセス量に制約があり、将来の料金や無制限利用を保証しない。Vercel自体の適用プラン・利用枠も自身の契約を確認する。商用利用やアクセス増加時にはこの試作用構成を再検討する。

RedisのREST URLとREST TOKENは[Upstashのコンソール](https://upstash.com/docs/redis/features/restapi)から取得する。接続文字列 `redis://...` とREST URLは別。トークンをチャットやソースへ書かない。

## 3. 環境変数を登録する

Vercel Project → Settings → Environment Variablesで登録する。必要なProduction / Preview環境へ適用し、変更後はRedeployする。

|変数|必須|値・用途|
|---|---|---|
|`ROUTING_CONTACT_EMAIL`|徒歩計算に必須|サイトに公開してよい運営者メールアドレス。画面と経路サービス向けUser-Agentに使用|
|`UPSTASH_REDIS_REST_URL`|JR更新・徒歩計算に必須|RedisのHTTPS RESTエンドポイント|
|`UPSTASH_REDIS_REST_TOKEN`|同上|書込可能なRESTトークン。サーバー側だけで使用|
|`APP_ORIGIN`|任意|独自ドメイン等の `https://example.com`。未設定なら `VERCEL_PROJECT_PRODUCTION_URL` を使用。両方ない場合は設定が必要|
|`ROUTING_FOOT_URL`|任意|標準は `https://routing.openstreetmap.de/routed-foot/route/v1/foot/`|
|`ROUTING_PRIVACY_URL`|独自経路サーバー利用時|利用者が確認できる経路提供先の利用条件・プライバシーページ|

Vercel連携が `KV_REST_API_URL` / `KV_REST_API_TOKEN` を作成する場合も読み取れる。`UPSTASH_...` があればそちらを優先する。RedisはPreviewとProductionで同じデータベースと既定の名前空間を使い、アプリ全体の経路要求数を合算する。

**変数名に `VITE_` を付けない。** クライアントへ埋め込む設定ではない。連絡先は公開用 `/api/config` に表示用として含まれるが、Redisトークン・URLは含まれない。`.env.local` はGitにもVercelへのアップロードにも含めない。ローカルに設定した連絡先も、Vercel側では明示的な登録が必要。

環境変数不足・Redis接続失敗時は外部取得を止める。JRは未取得状態、徒歩計算は設定不足／判定不可となる。設定済みの表示は、現地の経路が取れることやサービスの疎通成功を保証しない。

## 4. デプロイ後に確認する

1. HTTPSのアプリURLで駅を検索でき、採用したB案の出発目安画面が表示される。関西の対応範囲は画面の「関西の対応状況」と最新の対応一覧で確認する。駅数だけで全方面・全曜日への対応を判断しない。
2. `/api/config` で `deployment: "vercel"`、`enabled: true`、`jrEnabled: true` を確認する。トークン類が表示されていないことも確認する。
3. JR駅を選び、現在の運行日の日付と「日付別公式時刻表を確認済み」を確認する。初回は4駅8方面の取得・検証に時間がかかる。元サイトの拒否や書式変更があれば、取得不能を表示する。
4. スマートフォンから「現在地を更新」を押して位置情報を許可し、道路経路・徒歩時間・駅構内移動・乗車余裕を確認する。GPSを許可する前は位置を取得しない。
5. 駅・方面・入口を切り替える。取得中や失敗中に以前の経路で判定されないことを確認する。
6. PWAを使う場合は初回オンライン読込後にホーム画面へ追加する。ネイティブウィジェットではない。更新が反映されない場合は全アプリタブを閉じて開き直す。

位置情報はHTTPSで使う。現在地・駅入口はこのアプリのFunction経由で経路提供先へ送信する。アプリは座標をRedisへ保存せず、経路キャッシュは実行インスタンスのメモリーのみ。経路提供先はアクセスログを記録する。Vercelの基盤ログについてまで、アプリが一切の記録を保証するものではない。

## キャッシュと無料サービスの上限

- JR：取得時刻から6時間、日付ごとに共有。4駅8方面の正常な表が揃ってから保存。取得失敗は15分抑制。分散ロックにより異なるインスタンスの元サイト取得も重複させない。元サイトの要求間隔は1.2秒以上。
- 徒歩：経路の外部取得はアプリ全体で同時1件、1.1秒以上の間隔、直近1時間30回・24時間120回。Redisの原子的処理で制限し、障害時にメモリー制限だけへ切り替えない。同一インスタンスの経路キャッシュは10分。別インスタンスへのキャッシュ共有を保証しない。
- 利用条件：FOSSGISの[公式説明](https://routing.openstreetmap.de/about.html)は最大1要求/秒、高トラフィック・大量取得不可、帰属・修正リンク・識別User-Agent等を要求する。少人数の試用を想定し、無制限の公開API・商用サービスの主要機能用として扱わない。高負荷時は契約済みサービスまたは自前の徒歩用OSRMへ切り替える。
- 構内時間・入口の開閉・階段・信号・工事は実時間保証ではない。自動車用OSRMに `/foot/` を付け替えるだけでは対応できず、徒歩用グラフが必要。

## 公開範囲と権利条件

GitHubは現在公開です。コードと正規化データ・照合記録を保存し、`.cache`、秘密情報、個人の連絡先を含むローカル画面画像は除外します。原HTML/PDFは保存対象に含めません。神戸海岸線の原CSVはCC BY 2.1 JPの出典・加工表示とともに検証用の保全コピーを保存しています。取得・公開の条件は資料ごとに確認します。

神戸地下鉄CSVはCC BY 2.1 JP、OSM道路・入口はODbLに従い帰属を表示。JR・阪急・駅探等について、抽出データの公開・再利用条件が解決済みという意味ではない。公開前に [READMEの出典・利用条件](../README.md#出典利用条件の境界) と各調査資料を確認する。必要ならVercelの公開範囲を制限して確認を進める。コードにデプロイ設定があることと、時刻データの再配布許諾があることを混同しない。

## 開発・CIの確認

```sh
npm ci
npm test
npm run build
npm run check:package
npx playwright install chromium
npm run test:e2e
npm run test:pwa
```

CIは合成HTML/CSVと保存済みの正規化データ・検証記録を使う回帰テスト。公式サイトを再取得して最新ダイヤを保証する処理ではない。`check:package` はVercelと同系統のNode依存追跡で、秘密ファイルを含まないFunctionを別ディレクトリへ構成し、環境変数未設定時の起動を確認する。Vercelへのデプロイは実行しない。

Redisのテストはコマンドの契約を模したテスト用実装を使用する。実際のRedisサーバーでのLua実行・分散競合、Vercel上のルーティング・実行時間・外部サービス疎通は未検証である。デプロイ後は上記の確認手順を実施する。

JR以外の時刻表更新は各 `data:* -- --refresh` で取得・照合し、ビルドしてGitHubへ反映する。ビルド時に自動スクレイピングしない。`data:rebuild` は取得者のローカル `.cache` を必要とし、clone直後のCIでは実行しない。

## URL共有の画像と説明（追加）

現在の公開URLは https://train-time-three.vercel.app/ 。ページを取得するだけで共有サービスがdescription・OG/Twitterタグを読めるよう、build時のHTMLへ挿入する。画像は `/og-image.png`（1200×630）。`APP_ORIGIN`はこのURLのorigin（末尾 `/` は可）を指定する。未指定ならVercelのproduction URL、さらに未指定なら既定の公開URLを画像用に採用する。サーバーAPIのorigin設定・秘密環境変数の扱いは従来どおり。

mainの更新をVercelで取り込んだ後、公開ページと画像が200で取得できることを確認する。共有先に古いキャッシュが残っている場合は再取得を待つ必要がある。ブラウザのアドレスバー自体に常に画像が表示される機能ではない。ネイティブウィジェットはVercelデプロイとは別に端末へ専用アプリを入れる必要がある。

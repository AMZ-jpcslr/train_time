# デプロイ後も古い画面が残る問題の修正

2026-10-22。対象は `https://train-time-three.vercel.app/`。変更前commit `d0ba1da`。

## 原因と確認範囲

公開先のHTMLは `index-C1Q3Cg-f.js` を参照し、利用者のビルドログと一致していた。ビルドとデプロイは成功しており、500kB超のchunk警告は処理失敗ではない。公開先の旧 `/sw.js` は `mania-u-f0b4e7fcb2d1` の保存HTMLをnavigation時に優先し、`skipWaiting`も画面の更新検出・切替処理も持っていなかった。

この組み合わせでは、既存のタブやホーム画面アプリが残る間、新版workerは待機し、再読み込みしても旧workerの保存HTMLが返り得る。新規アクセスで最新ファイルを確認するだけでは、既存利用者の更新を証明できていなかった。実際のService Workerを入れた旧版画面・複数タブで同じ状態を再現した。利用者自身の端末のキャッシュを直接読んだものではない。

## 修正

- 完全に取得できたビルドを `mania-u-v2-*` に保存し、旧方式のcacheがある場合だけ `skipWaiting`・`clients.claim`・一度の再読み込みで移行する。
- `activate`の完了処理で`client.navigate`の完了を待たない。navigationのfetch側がactivation完了を待つ循環を避ける。
- オンラインのnavigationはネットワーク優先、失敗・3秒timeoutでは取得済みHTMLへ戻す。新HTMLを旧cacheへ上書きせず、完全に取得済みのビルドをオフライン用に保持する。
- 以後のv2→v2は利用者が「最新版に更新」を押した時点で適用し、複数タブも各1回だけ再読み込み。入力途中の内容は先に保存する案内を表示する。
- 初回インストールでは再読み込みしない。同じタブを開いたまま次の版が来た場合は切替可能にする。
- 起動・画面復帰・オンライン復帰で更新確認、通常の復帰確認は60秒間隔に抑制。カウントダウンごとに取得しない。
- 手動の「アプリの更新を確認」、取得失敗・オフライン・切替timeoutを表示。登録に一度失敗しても手動で再試行できる。
- `/sw.js`の再利用抑止とトップHTMLの再検証ヘッダーを指定。ハッシュ付きJS/CSSのキャッシュは活用する。
- localStorage・登録地点・お気に入り・設定・日別時刻表は消去しない。Service WorkerのcacheにもGPSやAPI応答を追加しない。

## 検証

更新試験はモックのService Worker APIではなく、独立したHTTPサーバーで旧版→新版の配信を切り替え、Chromiumの実Service Workerを動かした。

|試験|結果|
|---|---|
|旧cache-first版・旧main（更新処理なし）の2タブから新版へ移行|成功。各タブ1回だけreload、独自駅選択とホーム画面追加案内を表示|
|旧版からの移行後に保存データを比較|成功。登録地点・お気に入り・設定が一致|
|v2の次版を待機→更新ボタン→複数タブ切替|成功。初回install時のタブと既に制御済みのタブの両方|
|v2更新の必須JS取得を503にする|成功。未完成の版を有効化せず、旧版のオフライン起動を保持|
|legacy移行時の必須JS取得を503にする|成功。自動移行せず、旧画面・保存データを保持|
|オンラインで新HTML、オフラインで完全な旧shell|成功。新しいHTMLのみをオフラインcacheへ混ぜない|
|更新状態・初回/次回controllerchange・復帰抑制・失敗再試行|単体6件成功|
|スマートフォン320px/390pxの更新案内|横溢れなし、更新ボタン44px以上・画面内。スクリーンショット目視済み|

実行コマンド：`npm test`（280件成功）、`npm run build`、`npm run check:package`、`npx playwright test --config=playwright.pwa.config.ts --workers=1`。更新用5シナリオと従来のオフライン時刻表試験を分けて検証する。iPhone/Safari/Androidの実機更新は未検証。

## 利用者の操作

修正版の配信後、オンラインでサイトを一度再読み込みする。旧方式を検出した場合は、新版のダウンロード完了後に一度画面が切り替わる。旧版が残る場合は、このサイトの全タブとホーム画面から開いたアプリを閉じ、再度開く。サイトデータ全消去は登録地点等も失うため、通常の更新手順には含めない。

以後は画面上部の「アプリの更新を確認」→新版がある場合の「最新版に更新」を利用できる。更新用の通信が失敗しても時刻表の確認期限は延長せず、元の利用可否判定を続ける。

公式仕様：[Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)、[skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)、[registration.update](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update)。

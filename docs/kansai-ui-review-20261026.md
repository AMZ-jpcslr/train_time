# 関西データ拡充・B案採用の統合記録

2026-10-26（JST）。ローカル実装・検証。公開、デプロイ、push、課金、契約、外部問い合わせは行っていない。

## 実装した範囲

UIはA/B/Cの操作比較を提示後、利用者がB「出発目安を優先」を選択。通常画面へ採用した。関西データは神戸の追加15物理駅（16駅・路線）、28方面、平日・土休日の56表を接続した。京都全線・海岸線・JR/阪急/阪神の新規沿線は未完了であり、全関西への対応完了とは扱わない。

|対象|今回の追加|接続後・未完了の境界|
|---|---|---|
|神戸 西神・山手線／北神線|15物理駅、16駅・路線、28方面、56表、8,882発車|既存2駅を合わせ17物理駅、18駅・路線、32方面、64表。新神戸は路線別2登録|
|関西の既存＋追加全体|11駅・路線／58表 → 27駅・路線／114表|同一事業者の同名駅をまとめると26駅。当日の有効性は方面・運行日・確認期限ごとに別判定|
|神戸 海岸線|追加なし|10駅・路線、18方面、36表待ち。旧CSVと現行2026-03-14の不一致があり接続不可|
|京都 烏丸線／東西線|追加なし、監査とCSV検査の入口を実装|保存GTFS32駅・路線、128方面×service区分。公式CSV本体未取得。timepoint=0を無条件採用しない|
|JR神戸線・京都線・琵琶湖線、阪急神戸線、阪神本線|追加なし、会社別処理・条件・例外を整理|大規模取得・再利用条件が未解決。既存の検索・参考表示を乗車目安対応へ昇格させない|

神戸の追加駅は、谷上、新神戸、三宮、県庁前、大倉山、湊川公園、上沢、長田、新長田、板宿、名谷、総合運動公園、伊川谷、西神南、西神中央。新神戸の西行は西神・山手線、東行は北神線として登録。谷上・西神中央の外向きに架空の発車表は作らない。各駅の両方面／終端の1方面と平休の対応は [神戸検証記録](kobe-expansion-20261026.md) に列挙。

新駅の代表座標を駅入口に流用していない。入口未確認駅では自動徒歩経路による判定を止め、利用者が登録した実測徒歩時間で使える。時刻表が有効なことと、現在地・経路が判定可能なことは別である。

## データの根拠と保守

神戸は公式一括CSV4本を取得し、レビュー済みSHA-256、全列の駅順・列数・区間・時刻順・重複・終着除外を検査。既存2駅8表1,318発車と完全一致。追加13表39アンカーを公式HTML本文から独立照合した。全駅全便を別資料と突合したわけではない。HTMLは全バイトを保存できておらず、CSV保管と同じ再現性はない。

原CSV・取得時刻・ハッシュ・URLは `.cache/kobe-expanded/` に履歴保存し、検証JSONを `docs/` に保持。改正日は2025-03-15、確認日は2026-10-26 JST。終了日未公表はnullであり永久有効を意味しない。再取得だけでは確認期限を延長しない。CC BY 2.1 JPの出典・加工表示を保持する。

[京都調査](kyoto-expansion-20261026.md) は公式カタログ／ファイル取得失敗、CSVの改正・条件確認範囲、GTFS仕様、今出川610便の一致とその限界を記録。[会社別調査](western-expansion-20261026.md) は取得条件・会社共通形式・未解決の許諾・変換器一般化の作業単位を記録した。個々の時刻という事実と、原表・データベース・配布条件は区別する。

[最終対応一覧](kansai-coverage-20261026-final.md) と [機械可読版](kansai-coverage-20261026-final.json) は駅・路線・方面・運行日ごとに検索、取得、保存検証印、照合記録、当日有効、乗車目安に必要な時刻表条件を分離。平日10/26、土曜10/31、日曜11/1、祝日11/3の196セルを検査し、164セルが保存時刻表条件を満たす。残り32セルはJRの日付別表が未取得であり、実行時APIの成功を推定して埋めない。

更新コマンドは次のとおり。`NEXT_TIMESTAMP` は毎回新しい値に置き換える。

```powershell
node scripts/import-kobe-expanded.mjs --refresh
npx vitest run tests/kobe-expanded.test.ts tests/municipal.test.ts
node scripts/import-kyoto-network.mjs
node scripts/audit-kansai-coverage.mjs --dates 2026-10-26,2026-10-31,2026-11-01,2026-11-03 --compare docs/kansai-coverage-20261026-final.json --out docs/kansai-coverage-NEXT_TIMESTAMP
```

未知のCSVハッシュは生成停止。新しい改正・利用条件・全便差分・終端・短区間・24時以降・平休例外を確認し、根拠を更新してから接続する。詳細な再取得／差分／更新手順は事業者別文書を参照。

## UIと文言

[比較記録](ui-comparison-20261026.md) にA発車案内、B出発目安、Cいつもの駅の狙い・長所・弱点・操作数・画像・操作URLを記録。利用者による判断時間の測定や実ユーザーテストは実施していない。自動操作の実行時間を「何秒で判断できる」の証拠にしない。

Bは選択便、ここを出る時刻、徒歩と構内・余裕時間を一つの領域に配置。全便一覧は横スクロールで残す。駅・方面、お気に入り、徒歩時間への入口を下部へ置く。候補選択後は主表示へフォーカスを戻す。秒のカウント表示・常時点滅を避け、秒境界の判定は維持。レール図は詳細内に残し、列車の実位置でないことを表示する。

通常画面は実時計と既存の取得・保存機能を使用。固定時刻と仮の徒歩時間は比較URLだけ。既存の保存キー・設定形式を保持し、再読込時に以前の登録地点にいると決めつけない。[文言レビュー](ui-copy-review-20261026.md) に変更前・提案・実際の採用文と理由を記録。未対応、当日欠損、期限、通信失敗、オフライン、参考時刻、位置拒否、終電後を混同しない。

確認用URLは通常画面 `http://127.0.0.1:5173/`、比較は `?design=board` / `action` / `favorites` / `baseline`。`npm run dev -- --port 5173` で再開できる。A/Cを通常画面には混在させていない。旧UI比較は画面構造を保存し、共通部品の改善文言と新データは共有する。変更開始時のソースはGit HEADと開始時差分から再構成できる。

## 変更の保全と確認単位

開始HEADは `7b4dd84bfffea91939f5136911469643d161b8a3`。開始時status・patch・SHA-256を `.cache/work-20261026-baseline/` に保存。開始時に変更済みだったpackage.json、package-lock.json、import-kobe-network.mjs、kobe-network-validation.json、kobe-extra.json、kobe-extra-stations.jsonは6件すべてハッシュ不変。

データ生成・接続は `src/data/`、`scripts/import-kobe-expanded.mjs`、`scripts/import-kyoto-network.mjs`、`scripts/audit-kansai-coverage.mjs` と対応テスト。UIは `ActionDecision`、`App`、`StayTime`、`DepartureTimeline`、`action-live.css`、共通部品、`design/` と操作テスト。関西対応一覧はデータ状態を画面へ出す結合部分。未コミットのまま、別々に確認できる。

ローカル確認用に `.cache/work-20261026-baseline/data-review.patch` と `ui-review.patch`、`change-manifest.json` を生成。ユーザーの既存6ファイルを除外した差分であり、コミットや公開用パッチではない。画像もgitignoreに従いローカル保持。

## 検証結果

最終結果は以下。再実行で解消した項目は、最初から成功したように扱わない。全ログは `.cache/work-20261026-baseline/` に保持する。

|検査|成功|失敗・スキップ・再実行|
|---|---:|---|
|Vitest全体|424 / 424|`vitest-complete.json`。最終実行はtestTimeout=15秒。途中に負荷下のODPT監査1件タイムアウトがあった。今回EPERMは発生していない|
|型検査・本番ビルド|成功|`npm run build`内の`tsc -b`、Vite、Service Worker生成。大きなチャンク警告あり|
|通常画面E2E|130項目成功確認|全体実行127成功・3失敗・2スキップ後、Windows暗号化の待機タイムアウトを含む同ファイル6件を1workerで再実行し全成功。2スキップは旧レビュー画像取得の明示的opt-in|
|A/B/Cと旧UI比較|14 / 14|通常設定の不変、6操作、連打、戻る、オフライン、例外、画像。`design-final.json`のcompare.spec分|
|採用Bの保存・復帰・撮影|2 / 2|通常データ、実測地点、設定導線、お気に入り、再読込、320px。最終撮影結果を別保存|
|幅320/375/390・200%文字拡大|15 / 15|`layout-complete.json`。停止時計でのレイアウト検査は動き軽減、実タイマーの動作は別に検査|
|実測への復旧・長い徒歩・全便閲覧|8項目成功確認|全体7成功・1タイムアウト後、同じmobile-360ケースを単独再実行して成功。`journeys-recheck.json`と`journey-timeout-recheck.json`|
|Chromiumタッチ・連打・閲覧アニメーション|12項目成功確認|全体10成功後、文字列のDOM内改行の照合を修正した2件を再実行し成功。選択時は即時同期、閲覧時の途中フレーム・レール追従は実タイマーで検査|
|PWA・オフライン・更新|8 / 8|`pwa-recheck.json`。オフライン未保存駅の案内を修正後に全件成功|
|WebKit|0件検証完了|18件がブラウザ起動段階で失敗。画面動作の合否は判定できない。Windows上のPlaywright.exeが開始直後に終了。`interactions-final.json`|
|データ対応監査|構造エラー0、表ID重複0|27駅・路線114表、196日付セル。ソースの現地運行を保証する検査ではない|
|開始時変更の保全|6 / 6ハッシュ一致|`preservation-final.json`。HEADも不変、コミットなし|

単体では平休・終端・方面・日付跨ぎ/24時以降・改正前後・鮮度期限・欠損・重複・カレンダー例外を検査。ブラウザでは参照時刻から計算しないこと、位置拒否・誤差・取得中止・遅延応答・再読込・期限・当日欠損・終電後・設定とお気に入りの保持を確認した。GPS/経路/API応答は試験用応答を使用し、利用者の実際の位置は取得していない。

途中に判明した製品不具合は、オフラインの理由が一般的な通信失敗へ置き換わる表示、淡色背景での旧文字色、選択後フォーカス移動と一覧内smooth scrollの競合。「余裕のある便へ」は初期候補と同じ余裕3分以上に統一した。比較段階でのEscape・連打・自動縦スクロールの問題も修正した。検査自体の問題（古い文言/DOM前提、出力ディレクトリの競合によるENOENT、同時負荷時の暗号化待機・試験時間超過）は製品不具合と分けて記録する。

再現例（各出力先を分け、重いスイートは順番に実行する）:

```powershell
npm test -- --testTimeout=15000
npm run build
npx playwright test --config=playwright.config.ts --workers=1 --output=test-results/review-e2e
npx playwright test --config=playwright.design.config.ts --workers=1 --output=test-results/review-design
npx playwright test --config=playwright.layout.config.ts --workers=1 --output=test-results/review-layout
npx playwright test --config=playwright.journeys.config.ts --workers=1 --output=test-results/review-journeys
npx playwright test --config=playwright.interactions.config.ts --project=touch-320 --project=touch-390 --workers=1 --output=test-results/review-touch
npx playwright test --config=playwright.pwa.config.ts --workers=1 --output=test-results/review-pwa
```

前回のEPERM未確認11件を履歴だけで成功扱いにはしていない。今回の全Vitest実行424件に未実行・失敗はない。一方、WebKit・実機・実運行など別の検証境界は残る。

## 残る制約

- 京都公式CSV本体の取得・列確定・全線変換・独立照合は未完了。GTFS提供元のtimepoint=0の個別意図も未確認。既存の除外条件は維持。
- 海岸線の現行版一括CSVは未取得・未検証。旧版と現行表の差を解消していない。
- JR/阪急/阪神の追加大量取得は条件未解決のため未着手。必要な場合、具体的な取得元・許可範囲・費用・保守条件を確認する段階が残る。
- 神戸追加駅の入口位置は未確認。駅中心座標による徒歩判定はしない。
- 実端末の片手操作、屋外照度、OS文字拡大、スクリーンリーダー、実際のGPS精度・実経路・当日運行の現地照合は未実測。自動ブラウザのモバイル寸法・文字拡大試験と区別する。
- ビルド時の大きなJSチャンク警告が残る（約3.77 MB、gzip約335 kB）。実回線での初回読込時間は未計測。

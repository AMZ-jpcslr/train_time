# 今出川：現行公式時刻表と検証

2026-10-22に通常HTTPSで公式トップ・烏丸線一覧・今出川駅入口・両方面HTML・注記定義を取得した。2方面×平日／土曜休日の4表610便について、現行の公式導線と表の構造、件数、欠損、重複、順序、始発・日中・終電を照合し、通常ダイヤの徒歩乗車判定を有効にした。デモ時刻ではない。

## 現行性の確認方法

1. [公式トップ](https://www2.city.kyoto.lg.jp/kotsu/tikadia/tikatime.htm)は2026-03-14以降の時刻表と明示。
2. その実リンクを[烏丸線一覧](https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/line02.htm)→[今出川駅](https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/menu0216.htm)とたどり、[南行](https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/021600.htm)・[北行](https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/021601.htm)を確認。
3. 両方面の現行掲載HTMLを再取得し、各20時間行（5～24時）と便の通し番号を検査した。

個別表の「2025-02-22現在」は、トップの「2026-03-14以降」と異なる。この日付だけで旧版と断定せず、現行トップから現在も公式に掲載されている通常時刻表であることを確認した。一方、個別表のダイヤが実際にいつ変更されたか、掲載基準日が更新されない理由を確認できたわけではない。そのため revisionDate / validFrom / validTo は null を維持し、トップの掲載対象期間は検証JSONの topValidFrom とnotesに分離する。

ここで verified は「現行公式導線・構造・固定サンプル照合済」を意味する。全列車を2026年CSVやGTFSへ独立突合した意味ではなく、臨時ダイヤ、運休・遅延や将来の変更の保証でもない。年末年始の特定日は親アプリが別途停止する。

|方面・曜日|件数|始発|日中|終電|
|---|---:|---|---|---|
|南行・平日|166|05:28 竹田|12:02 新田辺|23:49 竹田|
|南行・土曜休日|139|05:28 竹田|12:02 新田辺|23:49 竹田|
|北行・平日|166|05:36 国際会館|12:00 国際会館|23:58 国際会館|
|北行・土曜休日|139|05:36 国際会館|12:00 国際会館|23:58 国際会館|

南行ホーム1・北行ホーム2、種別・行先・竹田まで各駅停車・烏丸御池接続待ちを保持。未知の記号は取込拒否。各導線のURL・取得日時・SHA256は [kyoto-validation.json](./kyoto-validation.json) に保存する。checkedAtは導線と表の取得日時の最古値であり、キャッシュを再解析した時刻に更新しない。

## 更新とテスト

- node scripts/import-kyoto.mjs — 保存済み6資料をオフライン再解析。
- node scripts/import-kyoto.mjs --refresh — 各資料1回、1.2秒間隔で通常HTTPS取得。旧raw/metadataは.cache/kyoto/historyへ保存。
- npx vitest run tests/kyoto.test.ts — 解析・日付またぎ・記号・ホーム・欠損・導線・新しい掲載日への無確認移行拒否。

現在確認済みのトップ2026-03-14と個別2025-02-22の組み合わせ以外へ変わった場合、改正日の意味と表を再確認するまで取込を停止する。リンク消失・他駅・サンプル変化・HTTPエラーでも旧JSONを書き換えない。

## 取得条件と残る境界

[2026年CSVカタログ00692](https://data.city.kyoto.lg.jp/dataset/00692/?page=1)はCC-BY4.0の烏丸線を提供しているが、今回のアクセスではメンテナンスページへリダイレクトされた。CSV未取得、GTFS未使用、API登録なし。東西線に関する「2025年から変更なし」を烏丸線へ流用していない。

今回の出典はHTMLであるため、そのCSVライセンスを転用しない。[利用案内](https://www2.city.kyoto.lg.jp/kotsu/tikadia/guide/about.htm)と[京都市の著作権等](https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html)の条件を記録する。個々の発車事実と創作的な構成・サイト条件を区別し、無料閲覧や試作を無制限の再利用許可とみなさない。元ページのデザイン・ロゴ・画像・JSを配信しない。公開・再配布・継続取得の許容範囲は未確認で、外部問い合わせや公開デプロイはしていない。

以前のpartial時点の記録は[履歴](./history/kyoto-sources-before-current-20261022.md)に残した。

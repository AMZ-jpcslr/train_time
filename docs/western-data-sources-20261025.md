# 関西・西日本の時刻表の別公開先

2026-10-25に、最初の11駅を収録したJR西日本・阪急・阪神・神戸市交通局・京都市交通局について再調査した。公開閲覧できる時刻表、再利用条件が明記されたデータ、第三者による変換サービスを区別する。この調査による西日本の新規時刻表取り込みは行っていない。

|事業者|確認した公開先・形式|アプリへの追加に向けた条件|
|---|---|---|
|神戸市交通局|[公式地下鉄オープンデータ](https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/)。西神・山手線／北神線は2025-03-15改正の4CSV、海岸線は2026-03-14改正の4CSV。駅所在地一覧もある。|CC BY 2.1 JP。既存の妙法寺・学園都市以外への拡張に利用できる。所在地一覧は入口座標ではない。|
|京都市交通局|[ODPTの京都市営地下鉄GTFS](https://ckan.odpt.org/dataset/kyoto_municipal_transportation_kyoto_city_subway_gtfs)、[20260703リソース](https://ckan.odpt.org/dataset/kyoto_municipal_transportation_kyoto_city_subway_gtfs/resource/e5ad5273-fd1f-4c80-b5c8-cdfcde2c4bd8)。従来の[公式駅別時刻表](https://www2.city.kyoto.lg.jp/kotsu/tikadia/tikatime.htm)とは別の一括公開先。|公共交通オープンデータ基本ライセンスとデータ固有条件。通常版`api.odpt.org`のconsumerKeyを要求する。キーなしでは403 `Require acl:consumerKey.`を確認。設定済みのチャレンジ用キーだけで取得可能とは扱わない。公開期間・更新版を取得時に確認する。|
|JR西日本|[JRおでかけネット](https://www.jr-odekake.net/railroad/)、[駅時刻表](https://timetable.jr-odekake.net/)、[マイ・ダイヤ](https://mydia.jr-odekake.net/)。|日付指定の公式閲覧先は存在する。今回調べた公式ページとODPTカタログ検索では、無償で一括再配布できるGTFS／CSVを確認できなかった。「他の公開先が一切ない」という意味ではない。|
|阪急電鉄|[公式駅情報](https://www.hankyu.co.jp/station/)。既存の大阪梅田・神戸三宮・六甲以外にも駅別の公開時刻表がある。|公式閲覧情報であり、ページ全体や内部データの一括再配布許諾とは別。今回のODPTカタログ検索「阪急」は該当なし。|
|阪神電気鉄道|[公式駅時刻表検索](https://www.hanshin.co.jp/system/search/time/)、公式の駅別PDF。|既存の甲子園以外にも公開先はある。今回のODPTカタログ検索「阪神」は該当なし。取得版・再利用条件の確認が必要。|

## 非公式APIにも西日本各社のデータがある

[Transit API](https://api.transit.ls8h.com/) の公開仕様と、実際の [`/api/v1/feeds`](https://api.transit.ls8h.com/api/v1/feeds) の応答を確認した。認証不要の読み取りAPIで、JR西日本の東海道本線・大阪環状線・福知山線等、阪急、阪神、神戸・京都の地下鉄の登録があった。

ただし阪急・阪神・地下鉄のlicense欄は「出典明記・再配布条件は原典規約に従う（スクレイプ由来）」、JR西日本は「公式駅別時刻表由来」等であり、原事業者からのオープンデータ許諾の証明ではない。取得日が2026年6～7月のものや、取得日の発着時刻を元にしたものもある。サービス期間の終了日が将来でも、毎日最新のダイヤであることは保証しない。

そのため公開場所として報告するが、このAPIの時刻表を今回そのまま取り込んではいない。サイトの[JR由来データ取得方針](https://transit.ls8h.com/jr-data-statement)と[利用規約](https://transit.ls8h.com/terms)は通常取得ではアプリの外枠のみ返り、本文の確認を完了できなかった。追加採用には原典の利用条件、運行日・曜日・改正日の精度、更新継続性を確認する必要がある。

## 契約型の提供先

[交通新聞社の時刻情報・構内図データ販売](https://www.kotsu.co.jp/service/jikoku_solution/data_sales/)には、全国のJR・私鉄の時刻表をCSV、XML、GTFS等で提供する案内がある。無料オープンデータではなく、法人・団体向けの契約と費用の確認が必要。契約申込や問い合わせ送信は行っていない。

## 調査の再現範囲

ODPTカタログに対して「JR西日本」「阪急」「阪神」「京都市営地下鉄」を検索し、前3件は該当なし、京都は1件を確認した。検索語やタグの違い、今後の追加を含む全公開データの不存在を証明する調査ではない。HTTP応答、第三者APIのフィード一覧と取得原文はローカルの `.cache/entrance-research-20261025/` に保存し、公開リポジトリに原時刻表や秘密情報は追加しない。

# ODPT・京都市営地下鉄 GTFS の追加調査

確認日: 2026-10-22（Asia/Tokyo）。以下は供給範囲と条件の調査であり、GTFSファイルの取得・取込・時刻検証は行っていない。登録・問い合わせ・課金も行っていない。

## 京都市営地下鉄

- [ODPT公式データセット](https://ckan.odpt.org/dataset/kyoto_municipal_transportation_kyoto_city_subway_gtfs)は「チャレンジ2026期間限定公開」と明記し、公共交通オープンデータ基本ライセンスおよび特定利用条件の確認を求める。
- [公式リソースページ](https://ckan.odpt.org/dataset/kyoto_municipal_transportation_kyoto_city_subway_gtfs/resource/e5ad5273-fd1f-4c80-b5c8-cdfcde2c4bd8)のHTML本文を通常の `fetch` で読み取り、20260703公開リソース、バージョン20260314、データ有効期間 **2026-03-14〜2027-03-31** を確認した。開発者サイトでユーザー登録することにより利用できる旨と、`acl:consumerKey` を要するZIPリンクがある。認証は試みていない。
- [チャレンジ2026公式サイト](https://challenge2026.odpt.org/)の実施期間は **2026-07-01〜2027-03-12**。この開催期間、データ内部の有効期間、公開/再利用できる期間は別概念。GTFS有効期間が2027-03-31までだからその日まで無条件に配布可能、という扱いにはしない。
- [基本ライセンス](https://developer.odpt.org/terms/data_basic_license.html)はJavaScriptアプリとして返り、今回のwebテキスト取得と通常HTTP取得では本文を読めなかった。利用するには期間終了後の利用・キャッシュ・派生データ配布・表記義務などを基本ライセンスと当該特定条件で確認する必要がある。全文確認前に同意やアカウント作成はしていない。
- [京都市公式CSVカタログ](https://data.city.kyoto.lg.jp/dataset/00678/?page=1)には2025-02-22改正という旧版が見つかった。上記20260314版の存在があるため、旧CSVを2026-10-22現在のダイヤとして無条件採用しない。提供媒体ごとに現行性を確認する必要がある。

GTFSは候補として実在を確認したが、本プロトタイプに取り込んでいない。登録が必要な供給元はユーザーの明示した制約により保留した。登録後に得られる `stops.txt`、`routes.txt`、`trips.txt`、`stop_times.txt`、`calendar.txt` / `calendar_dates.txt` と適用期間の実体は未検証。

## JR西日本・阪急のODPT提供範囲

[ODPTカタログのJR西日本検索](https://ckan.odpt.org/dataset/?q=JR%E8%A5%BF%E6%97%A5%E6%9C%AC)と[阪急検索](https://ckan.odpt.org/dataset/?q=%E9%98%AA%E6%80%A5)を通常HTTPで取得したところ、2026-10-22時点でどちらも「データセットが見つかりません」という応答だった。検索APIの試行はJSONではなくHTMLが返ったためAPI件数を証拠にしていない。

この検索結果は今回の提供を確認できないことの証拠であり、あらゆる別名・別組織・非公開契約を含む完全な不存在の証明ではない。JR東日本やJR貨物のデータがカタログにあることを根拠に、JR西日本の旅客4駅に利用可能と仮定していない。阪急神戸線についても同様。

## 神戸の区別

今回のアプリの神戸データは[神戸市交通局「地下鉄オープンデータ」](https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/)の西神・山手線CSVを使用する。市バスGTFSから地下鉄時刻を生成したものではない。詳細な出典、再利用条件、解析・照合記録は municipal 系ドキュメントに記載。

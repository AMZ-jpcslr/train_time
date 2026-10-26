# 京都公式 CSV の再取得調査（2026-10-26）

この追調査でも地下鉄の現行 CSV 本体は取得できず、新規接続は 0 駅・0 表。`src/data/kyoto-network*.json` は生成していない。既存今出川、共通 GTFS の `timepoint=0` 除外、既存 importer は保全した。取得できた CSV は京都市の**データ目録**であり、時刻表ではない。

## 通信の切り分け

2026-10-26 11:35〜11:43 JST に調査。接続先を別 IP に差し替える操作、証明書検証の無効化、外部代理サービス、認証・チャレンジ回避はしていない。

|対象・手段|観測結果|判明した境界|
|---|---|---|
|data.city.kyoto.lg.jp DNS|A=133.18.11.31、AAAA 応答なし|名前解決は成功|
|同ホスト HTTP 80、curl HEAD|TCP 0.167302 秒、10.011621 秒で応答 0 bytes、HTTP 000|TCP は成功、HTTP 応答・転送先は未取得|
|同ホスト HTTPS 443、Node TLS|DNS 79 ms、TCP 244 ms、8,073 ms で打ち切り、secureConnect なし|TLS ハンドシェイクが完了していない|
|京都市本サイト HTTPS、curl HEAD|HTTP 200、TCP 0.114495 秒、TLS 0.364496 秒、全体 0.421130 秒|他の公式ホストへのネットワーク・TLS は動作|
|通常 Brave の新規専用タブから 00692|10 秒で navigation タイムアウト、最終表示 about:blank|ブラウザーでもカタログ本文は未到達|
|web 取得ツール|トップと 00692 ともタイムアウト|検索索引の読める範囲とは区別|

TLS を完了できない観測であり、サーバー故障・経路上の遮断・メンテナンスのどれが原因かまでは特定していない。「CSV が存在しない」「403 で禁止された」「接続先が移転した」とも断定できない。

[公式トップ](https://data.city.kyoto.lg.jp/) の検索索引に、2026-10-21 掲載の **10 月 26 日 03:00〜04:00 予定**のメンテナンス告知がある。作業時間変更の可能性も書かれるが、11 時台の障害との因果は未確認。前回 02 時台の失敗もこの予定時刻では説明しきれない。

## 正規の代替導線を調べた結果

[京都府の移転告知](https://odcs.bodik.jp/260002/2021/10/27/%E3%82%AA%E3%83%BC%E3%83%97%E3%83%B3%E3%83%87%E3%83%BC%E3%82%BF%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%AB%E3%82%B5%E3%82%A4%E3%83%88%E3%81%AE%E6%96%B0%E3%82%B5%E3%82%A4%E3%83%88%E3%81%B8%E3%81%AE%E7%A7%BB/) は府の旧 datastore の移行で、京都市のホストの移転根拠ではなかった。

BODIK の[京都市登録・オープンデータ一覧](https://data.bodik.jp/dataset/261009_open_data_list) → [CSV リソースページ](https://data.bodik.jp/dataset/261009_open_data_list/resource/24fd1681-00d1-43b1-8810-17e5d5d95866) → ページ内の実リンクをたどり、一覧の本体を取得した。登録者は京都市、CC-BY 4.0。目録のカタログ最終更新は 2025-02-28 で、2026 年地下鉄の代替本体とはみなさない。

- 取得：2026-10-26T02:40:05.906Z、HTTP 200、4,725,390 bytes、UTF-8。
- SHA256：`0ad089bae5acc47218f6e18646c30cb9c21d0c10d9b4a83c7580b4c262d4ab66`。
- 42 列、19,985 データ行。地下鉄時刻表を指す行は 32 件、4 改正版（2018、2021、2022、2024）× 8 資料。
- 該当 32 件の dataset URL、access URL、download URL はすべて空欄。2026 年版は含まれない。URL パターンを推測して補完しない。
- 原本・取得メタデータ：`.cache/kyoto-csv-followup-20261026/bodik-open-data-list.csv` と `.meta.json`。
- 構造検査：`.cache/kyoto-csv/2026-10-26T02-41-36-248Z-inventory/report.json`。追跡可能な要約は同名 `-evidence.json`。

ユーザーの Downloads 直下の CSV/ZIP 名も、`京都|地下鉄|karasuma|tozai|00692|kyoto|tikadia|tikatime` の関連名だけ照合したが該当は 0 件。無関係なファイル内容や子フォルダーの広範検索はしていない。

[現行交通局 HTML のトップ](https://www2.city.kyoto.lg.jp/kotsu/tikadia/tikatime.htm) は閲覧でき、2026-03-14 以降の表示を確認できた。ただし [案内ページ](https://www2.city.kyoto.lg.jp/kotsu/tikadia/guide/about.htm) から案内される [京都市著作権方針](https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html) は、法令上の例外を除く無許諾の転載等を認める一般的なオープンデータ許諾ではない。個々の発車時刻という事実と、HTML 表全体・データベースの再利用条件は区別する。CSV の CC-BY を HTML 全駅の大量取得・再配布へ流用せず、今回 HTML から全線データを新規生成していない。

## 再開用 CLI と更新手順

`scripts/import-kyoto-csv.mjs` は**取得・診断の事前工程**。本体の列を未確認のため、時刻表変換器が完成したという意味ではない。すべて新しい日時別 `.cache/kyoto-csv/` へ書き、既存出力を上書きしない。

```powershell
# 保存済み目録を再検査。ネットワークなし。
node scripts/import-kyoto-csv.mjs --inventory .cache/kyoto-csv-followup-20261026/bodik-open-data-list.csv
# 復旧確認が必要になった時だけ、正規ホストへの TLS を 1 回、最大 8 秒。
node scripts/import-kyoto-csv.mjs --diagnose
# 復旧後、正規 00692 ページを 1 回、最大 15 秒・2 MB。自動再試行・転送追従なし。
node scripts/import-kyoto-csv.mjs --catalog
# 成功した過去原本がある場合、ハッシュ変更も記録。
node scripts/import-kyoto-csv.mjs --catalog <過去のcatalog.html>
```

応答が得られた場合、成功・拒否を問わず本文、SHA256、取得日時、HTTP status、location と少数の許可ヘッダー（content-type / retry-after / x-amzn-waf-action / cf-mitigated）を保存する。cookie・認証ヘッダーは保存しない。本文保存は最大 2 MB で、超過時は途中までの本文と明記して拒否する。HTTP 200 だけを候補とし、WAF challenge は理由を記録して拒否する。正常カタログでは実際の `.csv` アンカーを保持する。リダイレクト先、未確認ライセンス、HTML 構造変更、失敗は明示し、自動追跡・本番 JSON 出力はしない。ボタン式ダウンロードは自動推定せず、取得できた正規画面から実リンクを確認する。今回 `--catalog` の実再取得は、同じ失敗を繰り返さないため未実行（先行の curl・Node・web・ブラウザーの結果を保存）。

復旧後に残る作業：

1. 00692 の現行利用条件と 8 リソースの実リンク・改正日を再確認。ファイルごとに取得日時・SHA・原本・ライセンス証拠を保存。
2. UTF-8/Shift-JIS、列の意味、発車と到着、記号、直通区間、終端駅、平日/土休日、臨時運行日の扱いを実ファイルから定義。8 資料の共通形式を確認してから変換器を実装。
3. 路線・駅・方面・運行日別に全便差分を作り、重複、欠損、24 時以降、改正境界を検査。今出川 4 表 610 便と照合し、GTFS は別のライセンスと `timepoint` の意味を維持して比較資料に限定。
4. 差分と例外を人が確認できるレポートを保存。出典が示す適用期間だけを付与し、不明な終期や改正日を推測しない。検証が通った資料だけ親 bundle へ接続する。

## 実施した検証と未実施

- 成功：`npx vitest run tests/kyoto-csv.test.ts tests/kyoto-network.test.ts`、最終再検証 2 files / **21 tests passed**（11:47:24 JST、3.77 秒）。初回 15 件に加え、実ネットワークを使わず 202 空 WAF、200 メンテナンス、200 ライセンス不一致、正常カタログの実 CSV リンク限定、302 転送、2 MB 超過の 6 件を検証。全応答で 1 回だけ取得、`appTablesWritten=0`、保存 manifest と戻り値の一致を確認した。
- 成功：`node --check scripts/import-kyoto-csv.mjs`。保存済み実目録の検査も正常終了。
- 未実施：現行 CSV の全線変換・時刻照合・アプリ接続（本体未取得）。カタログ HTTP 成功時の実取得は未確認。全体 build / UI / 他社テストはこの担当の結果に含めない。

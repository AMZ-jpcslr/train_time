# 海岸線の現行CSV再調査（2026-10-26）

## 結果と接続境界

現行2026年3月14日改正版の公開リンクは4本とも存在する。原本が存在しない、旧版しか提供されていない、という結論ではない。

今回の直接取得はCloudFrontのHTTP 202、`x-amzn-waf-action: challenge`、本文0 bytesとなった。公式公開ページは通常Braveで表示でき、CAPTCHAは表示されなかった。通常リンクのダウンロード操作と専用保存APIはタイムアウトし、新しい原本の保存成功は確認できなかった。セキュリティ設定変更、トークン抽出、チャレンジ回避、問い合わせはしていない。

既存のDownloadsに平日東行原本1本（8,258 bytes）が保存されていたため、別ディレクトリへコピーして保全した。今回のネット取得成功とは扱わない。元のHTTP取得日時は不明。ファイルの更新日時は `2026-10-25T12:03:31.784Z`、ローカル保全日時は `2026-10-26T02:43:27.489Z`。Zone.Identifierは神戸市交通局のドメインのみを保持している。正確なURLは今回表示した公式ページの公開リンクから記録した。

- `src/data/kobe-kaigan-candidate.json`: 平日東行9表、900発車記録。現在は `verification: partial`。自動的には通常データへ接続しない。
- `src/data/kobe-kaigan-stations.json`: 海岸線10駅・18方面。K10新長田は西神・山手線S09と同じ物理駅として扱う。
- `docs/kobe-kaigan-followup-20261026-validation.json`: 36駅方面曜日行の対応一覧、原本ハッシュ、旧版との全差分、原列番号、独立サンプル照合、欠損を記録。
- 西行9駅の平日と、両方面18駅分の土休日、計27表は現行CSV未取得。旧版・別日・別方向・架空便で補完しない。

追加レビュー後、平日東行9表・900便だけを `src/data/kobe-kaigan.json` に承認生成した。独立レビューは9駅の初発・12時台全4便・最終の計54便について時刻と行先が一致。全900便の独立突合ではない。`candidate.json`はpartialのまま保持し、承認記録を `kobe-kaigan-followup-20261026-approval.json`、対応一覧監査向けの9表別証拠を `kobe-kaigan-followup-20261026-approved-validation.json` に分けた。承認日は `2026-10-26T02:49:27.941Z` 固定で、再生成日とは別。

`retrievedAt`はローカル原本取込時刻であることを文言の冒頭に明記し、`sourceAcquisition`に `kind: retained-official-download`、`downloadedAt: null`、`fileModifiedAt`、`importedAt`を保持する。表示側は通常のHTTP取得日時と区別すること。追加の独立レビューは `kobe-kaigan-independent-20261026.*` に別担当が保存する。

## 原本・出典・条件

公式一覧: <https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/>

公式ページの表示は「海岸線（2026年3月14日改正）」、利用条件はCC BY 2.1 JP。出典表示は「神戸市交通局」。個々の発車時刻と、CSV全体に示された利用条件を区別し、データ加工を明記する。適用開始は2026-03-14、終了日は公表確認できずnull。終了未定は永続的な現行保証を意味しない。

4本のURLは `https://kotsu.city.kobe.lg.jp/wp-content/uploads/open_kaigan_{w|h}_{east|west}_r080314.csv`。URL推測ではなく、一覧ページのリンクをwebと通常Braveで確認した。保存済み平日東行原本SHA-256は `a671284c499450cd336fa72d44ba644efd1c078b691fc30e518dfcb7f822bf40`。

保全場所:

- `.cache/kobe-kaigan-followup/local-original/`: 原本・元パス・mtime・コピー時刻・ハッシュ。
- `.cache/kobe-kaigan-followup/2026-10-26T02-38-05-475Z/`: 4直接取得の応答本文（0 bytes）と全応答ヘッダー、日時。空ファイルは原本CSVではない。
- `.cache/kobe-kaigan-followup/catalog-20261026.json`: CKAN公開APIの再確認。
- `.cache/kobe-kaigan-followup/ckan-recheck.json`: CKAN平日東行1本の再取得。9,959 bytes、SHA-256は前回旧版と同一。CKANのメタデータ更新日は現行ダイヤの証拠にしない。

## 変換・検査

現行CSVは始発駅・行先駅のヘッダー2行、10駅の順序付き行、列車単位の列。Shift_JISで読み取る。現行原本に全行空白の2列目があり、旧共通変換器では列車と誤認していた。新変換は**列全体が空白のときだけ**除外し、元の1始まり列番号を追跡する。部分欠損の列は捨てず失敗させる。

各列の始発・終着、走行範囲内の欠損、範囲外の値、駅順序、時刻逆転、発車重複を検査。三宮・花時計前の終着到着101件と御崎公園の終着到着2件を出発候補から除外。御崎公園行の短区間便は途中駅で保持する。00:00は営業日24:00へ変換し、翌暦日との関係を保つ。

候補生成段階では公式HTMLの中央市場前・御崎公園・旧居留地大丸前の初発、12時台全4便、最終、行先凡例を確認。承認段階では別担当のレビューを合わせ全9駅54便を照合した。CSVから期待値を生成せず、別経路で読んだ値を固定した。元HTML全文は保存できておらず、抽出した事実・URL・確認時刻を記録している。全駅全便の別資料突合ではない。公式PDF `2026-k05-e.pdf` は今回403となり、今回のPDF独立照合は未実施。

旧CKAN中央市場前平日東行117便に対して現行原本101便。旧初発05:43に対し現行05:44、旧最終23:53に対し現行23:54などの差がある。旧CSVへの2026改正ラベル貼替はしない。

駅座標は保存済みOSMの駅中心。出入口として登録しない。K10にはK10の駅中心を使い、S09の入口やJR駅を勝手に流用しない。

## 再取得・更新手順

1. 公式一覧で改正日と4リンク・利用条件を確認する。
2. `node scripts/import-kobe-kaigan.mjs --refresh` は公開URLを通常GETし、日時付きの新しいキャッシュへ保存する。202/403・空本文・チャレンジヘッダーなら保存した失敗証拠を示して停止する。自動再試行や制限回避は行わない。
3. 通常ブラウザーで保存できる場合は公開リンクを使う。CAPTCHA/許可が必要になれば停止し、保存済み原本の取得来歴を別記する。
4. 4原本が揃ったら `kaiganNetwork(text, direction)`、`kaiganDepartures(network, name)` で各9表に変換し、原本ハッシュ・実取得日時・現行改正日・公式HTML/PDFの独立照合を新しい記録へ保存する。`coverageRows(keys)`は4キーで36表を表現できる。現時点のCLIは1本の既知原本だけを候補化する。
5. 既存保存済み1本を再構成する場合は `node scripts/import-kobe-kaigan.mjs --local-candidate`。既存の候補出力は `.cache/kobe-kaigan-followup/generated/日時/`へ退避してから更新する。既知ハッシュ不一致は停止し、確認日時は再実行だけで更新しない。
6. 旧版比較は便数だけでなく時刻/行先キーの追加削除一覧を確認する。短区間便、終端、24時以降、平休日、改正境界を重点確認する。全欠損を独立した不足として維持する。
7. 独立レビュー後に親担当がbundle/stations/対応一覧を結合する。部分取得を全線全曜日対応と表現しない。

承認済み9表の再生成は `node scripts/import-kobe-kaigan.mjs --approve`。独立manifest全バイトのSHA-256 `1fb9133d91561e08a8e6cc3913f73833ef6f0e2f1f0a7f72f00aea3ff4e30a54`、原本SHA、9表範囲、54便期待値と行先、候補全900便と原本の一致、取得来歴・改正日を照合してから別ファイルへ書く。manifest・原本・対象範囲の変更は自動承認しない。原本8,258 bytesと来歴は `.cache`の外にも `docs/kobe-kaigan-followup-20261026-source/` へ保存し、承認コマンドと担当テストはこの保全コピーを利用する。

駅情報のリンクは公式一覧を通常Braveで確認した各駅の時刻表ページへ設定した。不足する西行/土休日でも該当駅の公式情報へ移動できる。K01は公式一覧の `sannomiya-hanadokeimae` リンク、K10は `k-shinnagata/` であり、S09の `s-shinnagata/` と区別する。

担当検査: `npx vitest run tests/kobe-kaigan.test.ts`。初回は変異テストの置換対象が原CSVの空白を考慮しておらず1件失敗したため対象を修正し、候補検査6件は再実行で成功。承認後に固定レビュー・原本/候補改変・範囲欠損の拒否を2件追加。型検査・ビルド・統合E2Eは親担当の範囲で、この担当では実行しない。

取得ゲートの追補：`--refresh`は転送を追従せず、HTTP200・非空・WAFなしを要求し、本文をストリームで最大2MiBに制限する。失敗時は最大4KiBの本文prefixと少量の応答ヘッダー・status/location・保存範囲のSHA/hashScopeだけを保持し、後続URLへ進まない。Cookieやトークンヘッダーは保存しない。実ネットなしの6件を追加し、担当合計14件成功。親の最終全体検証は [追補の統合記録](subway-source-followup-20261026.md) を参照。

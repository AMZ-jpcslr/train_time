# 採用済みB：出発目安を先に読む画面の仕上げ

## 方針とDFII

使用スキルは `C:/Users/yomas/.agents/skills/frontend-design/SKILL.md` と `frontend-developer/SKILL.md`。採用済みBの方向性は変更せず、「歩き始める時刻を先に読む、日常の出発案内」として整えた。主な用途は宣伝・回遊ではなく、普段の駅で次の行動を決めること。調子は実用的で落ち着いた案内に統一する。

識別の核は、大きな**出発目安の時計**と、その根拠になる**選んだ電車**を分ける階層。スマートフォンでは時計→選んだ便→計算条件、広い画面では時計を左・選んだ便を右へ置く。緑の面はこの判断単位だけに使い、周辺は紙色と細い境界線で整理する。写真・装飾・新しいアニメーションは追加しない。

| DFII項目 | 点数 | 根拠 |
| --- | ---: | --- |
| Aesthetic Impact | 4 | 出発時計を最初に読む構造と、幅の狭い大きな数字を一貫して使用 |
| Context Fit | 5 | 乗る便・出る時刻・徒歩条件を一つの判断として追える |
| Implementation Feasibility | 4 | 既存React/CSSと同梱フォントで構成。保存・データ・判定ロジックは維持 |
| Performance Safety | 4 | 新依存なし。図を閉じた通常状態のスクロール更新を削減 |
| Consistency Risk | 2 | B専用スコープに閉じる。拡大文字と既存CSSの優先順位を試験で確認 |

**DFII = (4 + 5 + 4 + 4) − 2 = 15。** 点数は設計上の自己評価であり、ユーザー試験の結果や客観的な性能スコアではない。

## デザインシステム

- 本文：既存 `Zen Kaku Gothic New`。数字の主見出し：既存 `Barlow Condensed`。日本語には本文フォントのフォールバックが働く。
- 同梱ファイルはそれぞれ166,384 bytes、34,188 bytes。両方SIL Open Font License 1.1で、`public/fonts/*-OFL.txt`を保持。外部配信の依存、新しいフォント、追加ライセンス契約はない。
- 既存 `font-display: swap` とローカル配信を使用。フォントなしの初回表示にはフォールバックがある。オフラインキャッシュの全体検証は親担当のPWA試験範囲。
- 背景 `--action-paper: #f7f4ed`、主判断面 `--action-panel: #e9efdf`、境界 `--action-rule: #bdcbb5`、計算条件 `--action-control: #f7f9f1`。既存の本文・補助文字・アクセント変数を引き続き使う。
- 余白は4px刻みを中心に、主判断の内側16–28px、セクション間14–24px。狭い幅では内容を縦に積み、時計や行先を切り捨てない。
- 主操作は最低48px高。キーボードには3pxのフォーカス輪郭。線路図は開いたときだけ連続的に追随し、`prefers-reduced-motion`では既存の動作縮小を保つ。

## 変更内容と理由

### 出発目安の位置

`ActionDecision.tsx`に `action-primary` と `action-service` を設けた。以前は選んだ便の時刻を読んでから出発目安へ進んでいたが、今回は出発目安を先頭に置いた。PCでは主判断面を横幅いっぱいに使って二列にし、過度な縦長を抑えた。DOM順序も時計→選んだ便の順なので、見た目だけ順序を変えるCSSにはしていない。

計算条件ボタンは数値を保持する。繰り返されていた徒歩・構内分数の説明は文言担当が `StayTime.tsx`で短縮した。定刻ベース・遅延未反映・乗車保証ではないという制約は画面上に残す。

### 読みやすさと拡大

主数字は同梱Barlowの600に揃え、幅の狭さを活かして200%でも時刻の数字を折り返さず表示する。補足11pxだった箇所の多くを13px、方面ボタンを14pxへ引き上げた。重要度の低い運行日などは12px。

全体200%確認で駅コードの折返しと、下部ナビが固定余白より高くなる状態を見つけた。コードは文字に応じて枠を拡大してnowrapにし、画面末尾の余白は `6.5rem + safe-area` に変更した。通常サイズのレイアウトを保ちつつ、文字拡大時に末尾の内容がナビの下へ埋まらないようにした。

色の計算上のコントラストは、主文字/判断面10.17:1、補助文字/判断面5.51:1、補助文字/紙色5.89:1、余裕状態/判断面6.60:1、フォーカス色/紙色4.50:1。色だけの状態表示にはせず、判定の言葉・選択中の文字・選択枠を維持する。実機の直射日光下での測定ではない。

### フル時刻表のスクロール

`DepartureTimeline.tsx`は全便・過去便・終電までの一覧を保持した。閉じている図にはカード番号だけを渡し、画素単位での同期更新をしない。図を開いた場合は従来のnative smooth scroll追随を維持する。

- 各カードで未来便配列の `indexOf` を繰り返していた順位計算を、共通Map参照に変更。
- 図に表示する前後5便は、全便map/filterではなく該当範囲だけslice。
- 到達可能便、余裕のある便、未来便をmemo化し、スクロール用の状態更新だけで全便を再走査しない。
- 値が変わらないフレームは状態更新を省略。図が閉じている間は2秒間の追加フレーム追跡を行わない。

選択・時刻計算・日付・方面を変える処理は変更していない。速度改善の実時間やCPU使用率は測定していない。上記はコード上の処理削減と、既存アニメーション試験による動作確認である。

## 比較条件と画像

before/afterとも同じ条件：2026-10-22 14:00 JST、今出川駅、北大路・国際会館方面、登録地点「いつもの場所」、実測徒歩1分＋構内3分。選んだ便は14:08、出発目安は14:04。時刻とAPIはテストfixtureで固定し、実GPS・外部API・ライブ運行情報は使っていない。

| 表示 | before | after |
| --- | --- | --- |
| 320 × 844 | `screenshots/frontend-release-20261026/before/b-320.png` | `screenshots/frontend-release-20261026/after/b-320.png` |
| 390 × 844 | `screenshots/frontend-release-20261026/before/b-390.png` | `screenshots/frontend-release-20261026/after/b-390.png` |
| 1280 × 900 | `screenshots/frontend-release-20261026/before/b-1280.png` | `screenshots/frontend-release-20261026/after/b-1280.png` |
| 主判断・カード200% | `screenshots/frontend-release-20261026/before/b-320-text-200.png` | `screenshots/frontend-release-20261026/after/b-320-text-200.png` |
| ページ全体200% | 未保存 | `screenshots/frontend-release-20261026/after/b-320-all-text-200.png` |

200%はroot font-sizeだけを変更する試験ではなく、明示px指定を含む計算済みfont-sizeを2倍にする。主判断とカードの拡大画像は要素全体のキャプチャで、固定ナビが画像の途中に写り込む場合がある。通常の画面では縦スクロールして読む。

`after/metrics.json`が最終測定値。通常画面の出発時計上端は320幅で413.6px、390幅で397.8px、PCで453.8px。主操作の最小高さは各幅48px。3幅すべてページ横overflowなし。全体200%時はナビ高131.375px、末尾余白182px、コード折返し・横overflowなし。

## 操作と検証

実際に操作した範囲は、登録地点で次の便を表示、一本後を選択、計算条件をキーボードEnterで開く、お気に入りへ戻る、ネイティブ横スクロールで次のカードを閲覧、線路図との同期、reduced motion、フォーカス表示。

- 主判断の変更後は出発目安→選んだ便の順序を3幅で検査。
- 200%ではhtml、hero、時計、残り時間、選択カードのscrollWidth/clientWidthを比較し、はみ出しなし。
- 画面全体200%は現在描画されている設定・ナビを含む。駅選択ダイアログを200%で開く操作、全空状態、全通信失敗状態の再検証はこの限定試験には含まない。
- 主操作対象の寸法、フォーカス輪郭、動作縮小時の常時アニメーションなしを検査。
- 「何秒で判断できるか」のユーザー測定はしていない。主時計が選んだ便の前に来ることと、操作を追加せず確認できることを評価した。人による押し間違い率も測定していない。

担当実行結果:

1. beforeキャプチャは取得成功。末尾のフォーカス試験はpointer操作直後のprogrammatic focusへfocus-visibleを要求したため失敗した。キーボードTabによる入力モードへ変更して試験を修正。製品の表示不具合を示す失敗ではない。
2. `tests/layout/frontend-release-design.spec.ts`、mobile-390プロジェクト内で320/390/1280を順に検査：最終1件成功。主判断/cards200%と全体200%を含む。
3. `tests/interactions/timeline.spec.ts` の `selection synchronizes immediately...`、touch-390：1件成功。選択と主表示の即時同期、カード/線路の連続移動、閲覧だけでは選択と計算が変わらないことを確認。

実行例:

```powershell
$env:DESIGN_REVIEW_PHASE='after'
npx playwright test tests/layout/frontend-release-design.spec.ts --config=playwright.layout.config.ts --project=mobile-390 --workers=1 --output=.cache/playwright-frontend-design-final-20261026
npx playwright test tests/interactions/timeline.spec.ts --config=playwright.interactions.config.ts --project=touch-390 --workers=1 --grep 'selection synchronizes immediately' --output=.cache/playwright-frontend-design-interaction-20261026
```

重い全suiteは並列実行しなかった。全unit・型検査・build・全体E2E・PWAは親担当の最終記録を参照する。この担当からGit操作、push、公開、デプロイはしていない。

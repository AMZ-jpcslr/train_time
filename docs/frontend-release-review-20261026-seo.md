# 公開前レビュー：SEO・画面読み込み・API境界（2026-10-26）

## 適用したスキルと判断

- `C:/Users/yomas/.agents/skills/frontend-seo/SKILL.md`: サイト情報の一元化、絶対canonical、純粋な生成関数、JSON-LD、実在ページからのsitemap/robots生成を採用。
- `C:/Users/yomas/.agents/skills/frontend-architecture/SKILL.md`: ネットワーク応答とユーザー設定の境界、型と実行時検査を持つAPI公開窓口、コンポーネントからの直接fetch分離を採用。
- `C:/Users/yomas/.agents/skills/frontend-developer/SKILL.md`: Reactのlazy/Suspense、不要な初回読み込みの削減、キャンセル処理、実際の操作テストを採用。

Vite／React 19を維持した。存在しない記事、RSS、人物情報、レビュー評価、検索専用URL、駅ごとの公開ページは作成していない。新しい状態管理ライブラリや全面的なフォルダー移動は不要と判断した。スキルの雛形のために既存実装を組み替えない。

## サイト情報と検索向け出力

実公開URL `https://train-time-three.vercel.app/` を通常GETで確認し、HTTP 200、現行titleとcanonicalを確認した。web閲覧ツールでは開けなかったため通常GETの結果を使用。公開操作はこの担当では実行していない。

`scripts/site-metadata.mjs` をサイト名・タイトル・説明・本番origin・画像情報・背景色の入力元とし、既存 `scripts/social-metadata.mjs` に生成関数を集約した。React起動前の配信HTMLへ次を出力する。

- title、description、canonical、Open Graph、X/Twitterカード。canonicalはホームの末尾 `/` に統一し、クエリ・断片・外部URLをページとして取り込まない。
- JSON-LDは実際のサービスを表す `WebSite` と `WebApplication`。名前・説明・URLを共有し、`@id` で関連付ける。架空の人物・価格・評価・検索アクションは含めない。
- sitemapは実在するホーム1件のみ。取得やビルドの日をページ更新日と偽らないためlastmodを出力しない。
- robotsはAPI配下を除外し、同じoriginのsitemapへリンク。Vercel preview環境と専用comparisonモードはnoindex/nofollow、robots全体除外、sitemap空とする。
- Bの背景 `#f7f4ed` をブラウザーtheme-color、PWAのtheme/backgroundに合わせた。manifestとの一致を単体試験で検査する。

出力はViteのビルドプラグインで生成される。originの既存優先順（APP_ORIGIN → VERCEL_PROJECT_PRODUCTION_URL → 実公開URL）は保ち、環境全体や秘密値をクライアントへ渡していない。

## 通常画面と比較画面の境界

`src/main.tsx` は、開発モードまたは明示した `--mode comparison` の場合だけ比較URLを読み、比較画面をlazy importする。通常productionでは `?design=board` 等を付けても採用Bを表示する。A/B/C専用の比較モジュール・CSSは通常productionのビルドから除外される。旧画面と通常画面が共有するApp内のコード・共通CSSまで除去したわけではない。既存の開発用比較操作は維持した。

比較用ビルドは `npx vite build --mode comparison --outDir <専用出力先>` で作成できる。通常公開用は既存の `npm run build`。比較ビルドを通常公開に使用しない。

[Vite公式](https://vite.dev/guide/env-and-mode)の環境値のビルド時置換と、[React公式](https://react.dev/reference/react/lazy)のlazy/Suspenseに従った。lazyはコンポーネント外で定義するため、再描画ごとの再定義を避けている。

## APIと設定の境界

`src/shared/api-client/index.ts` が同一originのJSON取得と `/api/config` の実行時検査を担当する。HTTP失敗をJSON成功扱いせず、外部リダイレクトを拒否し、必須enabledは真偽値として検査する。任意機能も文字列の `"true"` では有効にしない。未知フィールドをUIへそのまま流さず、危険なprivacy URLも落とす。

`src/useRuntimeConfig.ts` がサーバー状態を保持し、アンマウント時にキャンセル、15秒で打ち切る。ユーザーのお気に入り・設定ストレージには保存しない。App側変更はimport、フック呼び出し、旧fetch effect除去の3箇所のみ。時刻表の鮮度・方面完全性・判定条件は既存の各フックに残した。全API移行を済ませたとは主張しない。

## 検証結果

- `npx tsc -b`: 成功（buildでも型検査）。
- `tests/social-metadata.test.ts` と `tests/runtime-config.test.ts`: 45件成功。記録 `.cache/release-review-20261026T124436/seo-api-tests.json`。
- `npm run build`: 成功。生成HTMLのtitle1件、canonical1件、JSON-LD1件、robots/sitemapのorigin一致を検査。
- 通常productionの生成JSに比較用保存キーなし、比較コンポーネントの別chunkなし、生成CSSに比較画面スコープなしを検査。
- 開発用design E2E: 初回16件中15成功、mobile favoritesのoffline確認1件失敗。試験中のメタデータ依存ファイル更新によるVite再起動との競合が疑われるが、断定はしない。変更せず該当1件を再実行し成功。デスクトップ／モバイルの各3案・既存baseline・採用Bの操作は個別に成功確認済み。
- 初回production比較除外後のJSは3,852,265 B、CSSは67,855 B。変更前の既存distは3,868,129 B、81,974 B。同時作業中のため厳密な単独変更ベンチマークではない。大量の同梱時刻表が残り、500 kB超chunk警告は継続する。

Google Rich Results Test等の外部サービスへのURL登録・送信、Search Console、検索結果への反映、公開先へ今回の変更が配信されたかの確認は、この担当の検証対象外。構造化データは単体試験と生成HTMLのパースで検証した。JSON-LD追加は検索順位やリッチリザルト表示を保証しない。

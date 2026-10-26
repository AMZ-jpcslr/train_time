# タッチ閲覧後の選択便への戻り補正

## 症状と根拠

UI版685ee44のGitHub CIで、Chromium `touch-390` の `timeline.spec.ts`「browser touch swipe」だけが、最後の「余裕のある便へ」後に9pxずれたまま停止した。既存整列条件は左余白2pxからの誤差3px未満。閾値は変更していない。

取得したCI traceの `.timeline-strip` DOM snapshotから、初期の正しいscrollLeftは18426。逆向きswipe終端の18359からブラウザーのsnapが18360→18363→18368→18375→18410と進行する途中で、return click（callId `dflk@828`、startTime 34724.885ms）が始まっている。click後34968.479msのscrollLeftは18435で、基準との差は9px。後続の8秒pollも9pxで失敗した。

これは、進行中のnative snapが即時ジャンプの位置を上書きして残留した挙動と整合する。カード幅やテストの許容誤差を変えて隠す修正は行っていない。選択便が既に同じ場合は選択keyが変わらず、選択effectによる再ジャンプも起こらない。

ローカルの通常swipeは修正前の初回と計測付き5回の計6回すべて成功し、実gestureでのCI不具合そのものは再現しなかった。CPU4倍負荷の2試行はgesture途中で30秒の試験上限に達し、この9px不具合の再現として数えない。

根拠原本は `.cache/release-review-20261026T124436/ci-browser-failures/interactions/timeline-browser-touch-swi-a8603-r-the-departure-calculation-touch-390/trace.zip`。抽出した数値は `.cache/timeline-jump-ci-offsets-20261026.json`。

## 最小修正

`src/DepartureTimeline.tsx`で即時ジャンプ先のカードをrefに保持する。ブラウザーのscrollendで実位置と目標位置を比較し、ずれがあるときだけ1回補正する。補正前にrefを解除するため再補正ループにならない。

新たなpointerdown/touchstart/wheel/keydown、別ジャンプ、コンポーネントの破棄で保持を解除する。駅・方面・運行日変更は既存keyによる再生成と新ジャンプで旧目標を破棄する。利用者がその後に手動閲覧を始めた場合、古い選択位置へ引き戻さない。smooth閲覧のアニメーション、選択便、徒歩計算は変更していない。CSS変更なし。

scrollendを提供しない環境では既存の即時ジャンプ動作のままで、新しい定期タイマーや連続吸着を入れていない。新たなジェスチャーではrefが解除される。この環境に対する追加補正を検証済みとはしない。

## 回帰試験

新規 `tests/interactions/timeline-jump.spec.ts` は、CIで観測した「native完了位置が指示位置より9pxずれる」条件を最初のscrollToへ注入する。テスト内だけsnapを無効化して残留を維持する。修正前にExpected <3 / Received 9で失敗し、修正後に成功。これは固定した障害注入であり、実機のタッチ慣性を再現したという主張ではない。元のCDP native swipeテストも併せて維持する。

- 新規固定race：touch320/390の2ケース成功。
- 新規の手動操作優先：pointerdown・touchstart・wheel × touch320/390の6ケース成功。
- 既存の即時選択とsmoothカード/路線図同期：touch320/390の2ケース成功。
- 既存の本物CDP touch swipeと選択便への戻り：touch320/390の2ケース成功。
- 既存の連打・方向切替：touch320/390の2ケース成功。

以上14ケースの最終結果は成功。初回の修正後試験では固定raceの整列自体は成功したが、末尾の文言不変assertでinnerTextの改行をtoHaveTextと比較したため2件失敗した。比較方法をinnerText同士へ直し、その2ケースを含む最終8ケースを再実行して全件成功した。アプリの文言や閾値は変更していない。

主な出力先:

- 修正前固定失敗：`test-results/timeline-jump-before-20261026`
- 手動操作取消し6件成功：`test-results/timeline-jump-after-20261026`
- 最終8件成功：`test-results/timeline-return-final-20261026`（workers=1、2.4分、exit0）

担当の `npx tsc --noEmit` は成功（exit0）。ビルド・PWA全体とGitHub CIの再確認は親担当の結果を別に記録する。

### WebKitの追加確認

WebKit390では新規9px固定raceは成功。一方、既存smooth同期テストは単独再試行を含む2回、中間フレーム数が期待>1に対して1で失敗した。最終整列は成功し、traceのscrollLeftは18648→18652→18846→18870、cursor/iconは最終位置に到達していた。すべての後続assertが実行済みとは扱わない。

今回のscrollend接続だけをテスト用配信置換で取り除いた対照でも、同じ中間フレーム数1で失敗した。今回の補正処理が原因であることを支持しないが、環境負荷が原因だと断定する測定も行っていない。フレーム数閾値は緩和せず、これ以上の性能改修は行わない。GitHub CIで別途再確認する。

出力は `test-results/timeline-return-webkit-20261026`、`timeline-return-webkit-repeat-20261026`、`timeline-webkit-nohandler-control-20261026`。診断用specは`.cache`へ移して通常試験から除外済み。新fixtureの一時Windowプロパティはoptional型に修正した。

# iPhone / iPadアプリとホーム画面ウィジェット

SwiftUIのホストアプリ、WKWebView、WidgetKit extensionを含みます。iOS/iPadOS 17以降、Xcode 15以降を対象にしています。PWAのホーム画面追加と別のネイティブアプリです。

**このWindows環境で確認したのはファイル・Xcode参照・plist・fixtureの整合性です。Swiftコンパイル、XCTest、iOSシミュレータ、署名、実機でのウィジェット表示・GPS継続は未検証です。** `XCTest` のテストを実装していますが、成功したテスト件数として数えていません。Mac CI、Apple登録、有料契約、App Store提出は実行していません。

## 構成

- `Maniau.xcodeproj`：ホストアプリ・widget extension・単体テストの3ターゲット、共有`Maniau` scheme。
- `App/`：初回URL設定、Web画面、厳格な保存bridge、任意の背景位置更新。
- `Shared/`：32KiB以内のsnapshot検証、予定時刻と出発目安の計算、App Group保存、徒歩応答検証。
- `Widget/`：small/mediumのホーム画面widget。現在の選択便を優先し、発車済みなら次便へ移ります。
- `Tests/`：schema、選択、期限、日またぎ、時計巻戻し、保存形式、余裕の重複計上がないこと、origin検証、背景更新の純粋関数を検証する21個のXCTest。

## Macでのビルドとテスト

1. MacでXcodeをインストールし、一度開いて利用条件への同意とiOS Simulatorの導入を行ってください。この操作は利用者が行います。
2. `native/ios/Maniau.xcodeproj`を開きます。上部のschemeで`Maniau`、実行先で利用可能なiPhone Simulatorを選びます。
3. メニュー`Product > Build`、次に`Product > Test`を実行します。コマンドでは次のように確認できます。

```sh
cd native/ios
python3 scripts/check_project.py
xcodebuild -list -project Maniau.xcodeproj
xcodebuild -project Maniau.xcodeproj -scheme Maniau \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcrun simctl list devices available
# 以下のidは、直前に表示された利用可能なSimulatorのUDIDへ置き換えます。
xcodebuild -project Maniau.xcodeproj -scheme Maniau \
  -configuration Debug -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' \
  -derivedDataPath build/DerivedData -resultBundlePath build/WidgetTests.xcresult \
  CODE_SIGNING_ALLOWED=NO test
```

`CODE_SIGNING_ALLOWED=NO`はシミュレータ用のビルド確認です。実機に入れられる署名済みアプリを作る操作ではありません。SimulatorでApp Groupの共有コンテナが得られない場合は、XcodeのSigning & Capabilitiesを設定したシミュレータ実行で確認してください。プロジェクトを再生成する場合は`python3 scripts/generate_project.py`を実行します。Xcodeで追加した設定は生成スクリプト側にも反映してください。

## 署名と費用の境界

`Config/Project.xcconfig`の次の3項目はplaceholderです。

| 項目 | 設定例・意味 |
| --- | --- |
| `DEVELOPMENT_TEAM` | Xcodeに追加したご自身のTeam ID |
| `MANIAU_APP_BUNDLE_ID` | 所有・使用できる一意なBundle ID。例：`jp.yourname.maniau` |
| `MANIAU_APP_GROUP` | appとwidgetの両方に付ける同一App Group。例：`group.jp.yourname.maniau` |

実機導入は、Xcodeで`Maniau`と`ManiauWidget`の両ターゲットの`Signing & Capabilities`を開き、ご自身のTeamを選び、App Groupsに同じgroupを設定します。署名鍵・プロビジョニングプロファイルはGitへ追加しないでください。背景位置更新はホストアプリだけで`Background Modes > Location updates`を使います。

2026-10-22に確認したApple公式の[Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios)では、App groups行は無料のApple Developer列を含む3列とも利用可能のチェックがあります。そのためApp Groupの使用だけで有料加入が必須とは扱っていません。[Appleの無料アカウント](https://developer.apple.com/programs)にはXcodeから自分の端末でテストする用途が含まれます。ただし、この利用者のPersonal TeamによるApp Group登録・実機署名は未確認です。実際にXcodeが示す利用可能capabilityと署名エラーを確認してください。

App Store / TestFlightで他者へ配布する場合は別の段階です。[Apple Developer Program](https://developer.apple.com/programs/whats-included/)は年99米ドル（地域に応じた通貨）と案内されています。加入・支払い・登録・公開は実施していません。配布用のアイコン、ストア情報、プライバシー申告、審査対応もこのローカル試作の完了条件には含めていません。

## アプリとwidgetの使用手順

1. アプリを起動します。初期URL欄に`https://train-time-three.vercel.app/`が入っています。利用者が確認して`このURLを使う`を押します。後で`設定`から変更できます。
2. Web画面で駅・方面・乗りたい電車を選び、現在地または登録地点の徒歩時間を用意し、ウィジェット保存ボタンを押します。
3. iPhoneのホーム画面を長押しして、`編集 > ウィジェットを追加`（OSにより`＋`）から`まにあう — 出発の目安`を探し、小・中のいずれかを追加します。
4. widgetには選択便、出発地、保存時刻、出発の目安が出ます。中サイズは発車までの残り時間も分けて表示します。タップするとアプリを開きます。
5. 位置・徒歩情報の期限が切れた場合は徒歩更新案内、時刻表の期限が切れた場合は時刻表更新案内を出します。表示は乗車保証ではありません。遅延・運休は反映しません。

滞在時間は`発車予定 − 現在時刻 − 徒歩時間 − 入口からホームまでの時間`で計算します。別の乗車余裕は加算しません。選択した便が保存された最大5便に含まれない場合、そのsnapshotは保存を拒否します。

WidgetKitへ発車・出発目安・徒歩期限・時刻表期限のTimeline entryを渡し、残り時間にはシステムの動的タイマー表示を使います。固定の「あとN分」を保存しません。WidgetKitの実際の更新・表示頻度は[Appleの更新方針](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)に従ってOSが調整するため、秒単位の常時更新や指定時刻ぴったりの再描画を保証しません。絶対時刻を併記します。widget自身はネット通信・GPS取得をしません。

## 任意のバックグラウンド徒歩更新

既定OFFで、アプリを再起動した場合もOFFです。`設定`にある`① アプリ使用中の位置情報を許可`を押して許可した後、別の操作として`② バックグラウンド利用のため「常に」を許可`を押します。その後に`バックグラウンド更新`をONにしてください。iOSが再度の許可ダイアログを出さない場合は、iPhoneの`設定 > プライバシーとセキュリティ > 位置情報サービス > まにあう`で許可を確認します。

- Core Locationを使うのはホストアプリです。ウィジェットだけでGPSを常時ONにする実装ではありません。
- `Always`許可と`UIBackgroundModes=location`が必要です。位置取得中はOSの表示を隠しません。いつでもOFFにできます。
- 位置精度100m以内・取得5分以内のみ使用します。座標はメモリ上だけに保持し、履歴ファイルやsnapshotには含めません。
- 現在地から駅入口への問い合わせは最短150秒に1回、前回成功地点から60m移動または前回試行から4分後が目安です。同時通信は1本だけで、失敗時は最大30分まで待機を増やします。サーバー側の無料枠・全体回数制限にも従います。
- 通信先は設定済みHTTPS originの`/api/walking`固定です。座標をPOSTし、Webサーバーから既存の徒歩サービスへ渡します。リダイレクトは拒否し、応答は2MiBまでです。背景更新も経路サービス利用回数を消費します。
- 歩行経路と位置の接続が30mを超えると更新を採用しません。距離・時間・入口ID・要求した出発座標との一致・経路取得日時の鮮度を検証し、歩行速度を使って所要分を計算します。240分を超える徒歩時間は採用しません。
- 更新した徒歩情報の期限は位置取得から5分・経路取得から10分・時刻表期限の最も早いものです。元のsnapshot保存日時`generatedAt`は変えず、`routeUpdatedAt`に経路取得日時を記録します。
- 登録地点は`routingTarget=null`なので背景計算を開始しません。保存された便がすべて発車した場合、時刻表期限切れ、URL変更、保存対象変更、権限取消で停止します。
- 低電力モード、OSの自動休止、強制終了、圏外などで動作しなくなる場合があります。バックグラウンドから常時再起動する仕組みは入れていません。古い位置のまま滞在時間を保証する表示は行いません。

実機で確認すべき項目は、段階的な権限ダイアログ、青色の位置利用表示、ロック中の取得、移動/停止時の間隔、OFF時の通信停止、位置拒否、圏外、強制終了、期限切れです。**このWindows環境ではいずれも実機検証していません。** 実装判断にはApple公式の[位置権限](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)、[背景位置更新](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates)、[省電力の位置取得](https://developer.apple.com/documentation/xcode/accessing-the-device-s-location-efficiently)を確認しました。

## 保存bridgeと安全対策

```js
window.webkit.messageHandlers.maniauWidget.postMessage(JSON.stringify(snapshot));
window.addEventListener('maniauwidgetresult', event => {
  // event.detail.ok === true が保存成功。falseの場合は error を案内。
});
```

`schemaVersion:1`の共有contractを使います。必須キーは`generatedAt, stationName, directionName, serviceDate, timetableValidUntil, walkingValidUntil, originLabel, walkMinutes, stationMinutes, speedKmh, routingTarget, selectedDepartureId, departures`です。`routeUpdatedAt`はoptional/null可です。各departureは`id, departureAt, time, destination, trainType, platform`を持ちます。null項目を省略せず送信してください。`routingTarget`はnullまたは`{stationId, entranceId}`です。

信頼するのは利用者が設定したHTTPS originとmain frameのみです。外部ページのiframeからのmessageを拒否します。別originへのリンクは利用者がクリックした場合だけ外部ブラウザへ渡します。URL中の認証情報・query・fragment、未知JSONキー、過大データ、未来日時、重複便、不正な数値・期限・速度を拒否します。Bridge受信時は作成から5分以内を必要とします。App Groupファイルは原子的に保存し、再起動後の最初の端末ロック解除まで保護します。失敗時に生のJSONや座標をログへ出しません。

App Groupの仕組みは[Apple公式の設定方法](https://developer.apple.com/documentation/xcode/configuring-app-groups)を参照してください。

## Windowsで実行した確認

```powershell
python native/ios/scripts/generate_project.py
python native/ios/scripts/check_project.py
```

プロジェクトの全ID参照、参照ファイル存在、共有scheme、plist、App Group一致、背景権限宣言、JSON fixtureの日本時刻と発車時刻、出発目安の算術を検証します。Swiftソースの型検査を代替するチェックではありません。

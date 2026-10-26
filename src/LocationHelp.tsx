export default function LocationHelp() {
  return <div className="location-help">
    <p>現在地の誤差が大きいときは、位置を取り直すか、駅入口までの実測時間を使ってください。</p>
    <p>現在地から出発目安を計算するには、端末が示す位置の誤差が100m以下である必要があります。</p>
    <details><summary>端末・ブラウザーの設定方法</summary>
      <p>表示される誤差は、端末が推定した半径です。PCではWi-Fiなどから位置を推定するため、誤差が数百mになることがあります。Wi-Fiと位置情報の許可を確認し、改善しない場合はスマートフォンでも試してください。精度は端末や周囲の環境によって異なります。</p>
      <p><b>Windows 11：</b>設定 → プライバシーとセキュリティ → 位置情報で「位置情報サービス」をオン。Wi-Fiもオンにします。</p>
      <p><b>Mac：</b>システム設定 → プライバシーとセキュリティ → 位置情報サービスで、利用中のブラウザーを許可。Wi-Fiもオンにします。</p>
      <p><b>Chrome／Edge：</b>アドレスバー左のサイト情報 → サイトの設定／権限で、このサイトの位置情報を許可します。</p>
      <p><b>スマートフォン：</b>ブラウザーの位置情報を「使用中に許可」にし、「正確な位置情報」をオン。屋内では窓際などで再取得すると改善する場合があります。</p>
      <p><a href="https://support.microsoft.com/en-us/windows/privacy/windows-location-service-and-privacy" target="_blank" rel="noreferrer">Windowsの公式案内</a> · <a href="https://support.apple.com/ja-jp/guide/mac-help/mh35873/mac" target="_blank" rel="noreferrer">Macの公式案内</a> · <a href="https://support.google.com/chrome/answer/142065?hl=ja" target="_blank" rel="noreferrer">Chromeの公式案内</a></p>
    </details>
  </div>;
}

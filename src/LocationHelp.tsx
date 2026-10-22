export default function LocationHelp() {
  return <div className="location-help">
    <p>PCはWi-Fiなどから位置を推定するため、誤差が数百mのままになることがあります。表示値は端末が返した推定誤差の半径です。徒歩判定には100m以下の位置精度が必要です。</p>
    <p>PCのWi-Fiと位置情報の許可を確認して再取得してください。改善しない場合は、スマートフォンでこのアプリの公開URLを開き、正確な位置情報を許可してお試しください。精度の改善は端末や周囲の環境によって異なります。</p>
    <details><summary>端末・ブラウザーの設定方法</summary>
      <p><b>Windows 11：</b>設定 → プライバシーとセキュリティ → 位置情報で「位置情報サービス」をオン。Wi-Fiもオンにします。</p>
      <p><b>Mac：</b>システム設定 → プライバシーとセキュリティ → 位置情報サービスで、利用中のブラウザーを許可。Wi-Fiもオンにします。</p>
      <p><b>Chrome／Edge：</b>アドレスバー左のサイト情報 → サイトの設定／権限で、このサイトの位置情報を許可します。</p>
      <p><b>スマートフォン：</b>ブラウザーの位置情報を「使用中に許可」にし、「正確な位置情報」をオン。屋内では窓際などで再取得すると改善する場合があります。</p>
      <p><a href="https://support.microsoft.com/en-us/windows/privacy/windows-location-service-and-privacy" target="_blank" rel="noreferrer">Windowsの公式案内</a> · <a href="https://support.apple.com/ja-jp/guide/mac-help/mh35873/mac" target="_blank" rel="noreferrer">Macの公式案内</a> · <a href="https://support.google.com/chrome/answer/142065?hl=ja" target="_blank" rel="noreferrer">Chromeの公式案内</a></p>
    </details>
  </div>;
}

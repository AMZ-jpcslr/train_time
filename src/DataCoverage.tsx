import coverage from './data/odpt-coverage.json';
import {stations} from './data/stations';
export default function DataCoverage(){
 const added=coverage.filter(p=>p.status==='imported');
 const legacy=stations.filter(s=>!s.timetablePath);
 const lines=[...new Set(legacy.map(s=>s.operator+' / '+s.line))];
 return <section className="coverage-section" id="data-coverage" aria-label="対応路線とデータ">
  <h2>対応路線とデータ</h2>
  <p>検索対象：{stations.length}駅・路線。同じ駅名も路線ごとに表示します。時刻表は定刻の予定で、遅延・運休は反映しません。</p>
  {added.map(provider=><details key={provider.id}>
   <summary><strong>{provider.operator}</strong> · {provider.region} · {provider.id==='tosaden'?'東西線・南北線':`${provider.lines.length}路線`} / {provider.stationCount}駅・路線</summary>
   <ul>{provider.lines.map(line=><li key={line.name}>{line.name}：{line.stationCount}駅・路線</li>)}</ul>
   <p>元データの期間：{provider.validFrom}〜{provider.validTo}。取得確認：{provider.checkedAt.slice(0,10)}。確認から30日を過ぎると再取得まで乗車判定を停止します。運行日・方面により収録便は異なります。</p>
   <p>方面は次の停車駅（他社線への直通境界では「他社線への直通方面」）で表示。駅中心の位置情報を収録していますが、駅入口・徒歩経路は未確認です。徒歩判断には実測時間を登録してください。</p>
   <p>{provider.attribution}のデータを加工。<a href={provider.sourceUrl} target="_blank" rel="noreferrer">公開データ・出典 ↗</a> · <a href={provider.licenseUrl} target="_blank" rel="noreferrer">{provider.license}</a></p>
  </details>)}
  <details><summary><strong>関西の既存データ</strong> · {legacy.length}駅（一部駅のみ）</summary><ul>{lines.map(line=><li key={line}>{line}：{legacy.filter(s=>s.operator+' / '+s.line===line).map(s=>s.name).join('、')}</li>)}</ul><p>各駅・方面の取得範囲と現在の利用可否は、選択後の「出典・確認日」で確認できます。路線全駅への対応ではありません。</p></details>
  <details><summary><strong>未対応・取り込み保留</strong></summary>
   <p>ODPTの認証が必要：JR東日本、東京メトロ、東急、小田急、京王、京急、東武、西武、相鉄、りんかい線、つくばエクスプレス、多摩モノレール、ゆりかもめ、横浜市営地下鉄、京都市営地下鉄のODPT提供分。既存の今出川駅データは引き続き使用できます。</p>
   <p>函館市電（2・5系統）：データ取得・変換確認済み。<a href="https://gtfs-jp.org/GTFS-RUL(ODPT).pdf" target="_blank" rel="noreferrer">提供元の利用条件</a>で一般公開前の通知・承認が必要なため、アプリへの同梱は保留しています。</p>
   <p>駅ナンバリングなどのPDFは時刻表ではないため、発車案内の取り込み対象から除外しています。JR貨物のコンテナ時刻表も旅客向け発車案内の対象外です。</p>
  </details>
  <p><a href="https://challenge2026.odpt.org/" target="_blank" rel="noreferrer">公共交通オープンデータチャレンジ2026</a> · <a href="https://ckan.odpt.org/dataset/?tags=%E9%89%84%E9%81%93-railway" target="_blank" rel="noreferrer">ODPT鉄道データカタログ</a></p>
 </section>;
}

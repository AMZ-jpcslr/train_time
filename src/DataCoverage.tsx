import coverage from './data/odpt-coverage.json';
import entranceCoverage from './data/entrance-coverage.json';
import {stations as baseStations} from './data/stations';
import type {Station} from './domain/types';
import type {ChallengeCoverage} from './useChallengeCatalog';
export default function DataCoverage({stations=baseStations,challenge=[],challengeErrors=[],challengeLoading=false,challengeEnabled=false,onRetry}:{stations?:Station[];challenge?:ChallengeCoverage[];challengeErrors?:string[];challengeLoading?:boolean;challengeEnabled?:boolean;onRetry?:()=>void}){
 const added=coverage.filter(p=>p.status==='imported');
 const legacy=stations.filter(s=>!s.timetablePath);
 const lines=[...new Set(legacy.map(s=>s.operator+' / '+s.line))];
 const entranceInfo=(operator:string)=>{const row=entranceCoverage.coverage.find(r=>r.operator===operator);return row?<p>入口データ：{row.covered} / {row.total}駅・路線、{row.entranceCount}地点（{entranceCoverage.checkedAt.slice(0,10)}取得）。入口がある駅は現在地から徒歩時間を自動計算できます。未収録の駅は実測時間を登録してください。</p>:null;};
 return <section className="coverage-section" id="data-coverage" aria-label="対応路線とデータ">
  <h2>対応路線とデータ</h2>
  <p>検索対象：{stations.length}駅・路線。同じ駅名も路線ごとに表示します。時刻表は定刻の予定で、遅延・運休は反映しません。</p>
  {challengeEnabled&&<div className="challenge-coverage"><p>チャレンジ2026限定データ：サーバー側で認証して取得。元データ・トークンは公開配信ファイルに含めません。提供期間は2027-03-12までです。</p>
   {challenge.map(provider=><details key={provider.id}><summary><strong>{provider.operator}</strong> · {provider.lines.length}路線 / {provider.stationCount}駅・路線</summary>
    <ul>{provider.lines.map(line=><li key={line.name}>{line.name}：{line.stationCount}駅・路線</li>)}</ul>
    <p>取得確認：{provider.checkedAt.slice(0,10)}。サーバー側の取得キャッシュは6時間。原資料の平日・土曜・休日区分を使用し、年末年始の特別ダイヤは未確認のため表示を停止します。</p>
    {entranceInfo(provider.operator)}
    {provider.id==='keio'&&<p>競馬場開催日は、ODPTが明記した開催日カレンダーの対象日に限り、開催日用の時刻表を使用します。</p>}
    {provider.id==='jr-east'&&<p>関東の一部の在来線のみ。新幹線、中央・青梅線の特急は含みません。常磐線は坂元以南、中央線は高尾以東が対象です。臨時・他路線直通列車などの一部を含まない場合があります。</p>}
    {(provider.audit.unsupportedCalendars>0||provider.audit.unknownDestinations>0)&&<p>未対応の運行区分：{provider.audit.unsupportedCalendars}表。行先名の参照未確認：{provider.audit.unknownDestinations}件。行先・種別は確認できたものだけを表示します。</p>}
    <p>{provider.operator}・公共交通オープンデータ協議会のデータを加工。提供者はこのアプリの情報の正確性・完全性を保証しません。<a href={provider.sourceUrl} target="_blank" rel="noreferrer">出典 ↗</a> · <a href="https://developer.odpt.org/challenge_license" target="_blank" rel="noreferrer">チャレンジ限定ライセンス・特定利用条件</a></p>
   </details>)}
   {challengeLoading&&<p role="status">認証付きデータの対象路線を確認しています。</p>}
   {challengeErrors.length>0&&<p role="status">取得できなかった事業者：{challengeErrors.join('、')}。<button onClick={onRetry}>認証付きデータを再読み込み</button></p>}
  </div>}
  {added.map(provider=><details key={provider.id}>
   <summary><strong>{provider.operator}</strong> · {provider.region} · {provider.id==='tosaden'?'東西線・南北線':`${provider.lines.length}路線`} / {provider.stationCount}駅・路線</summary>
   <ul>{provider.lines.map(line=><li key={line.name}>{line.name}：{line.stationCount}駅・路線</li>)}</ul>
   <p>元データの期間：{provider.validFrom}〜{provider.validTo}。取得確認：{provider.checkedAt.slice(0,10)}。確認から30日を過ぎると再取得まで乗車判定を停止します。運行日・方面により収録便は異なります。</p>
   <p>方面は次の停車駅（他社線への直通境界では「他社線への直通方面」）で表示。</p>
   {entranceInfo(provider.operator)}
   <p>{provider.attribution}のデータを加工。<a href={provider.sourceUrl} target="_blank" rel="noreferrer">公開データ・出典 ↗</a> · <a href={provider.licenseUrl} target="_blank" rel="noreferrer">{provider.license}</a></p>
  </details>)}
  <details><summary><strong>関西の既存データ</strong> · {legacy.length}駅（一部駅のみ）</summary><ul>{lines.map(line=><li key={line}>{line}：{legacy.filter(s=>s.operator+' / '+s.line===line).map(s=>s.name).join('、')}</li>)}</ul><p>各駅・方面の取得範囲と現在の利用可否は、選択後の「出典・確認日」で確認できます。路線全駅への対応ではありません。</p></details>
  <details><summary><strong>未対応・取り込み保留</strong></summary>
   {!challengeEnabled&&<p>チャレンジ2026用トークンが未設定のため、JR東日本・小田急・京急・相鉄・京王・東武・西武・東急の認証付き時刻表は読み込んでいません。</p>}
   <p>通常のODPT用トークンによる対応は今後追加予定：東京メトロ、りんかい線、つくばエクスプレス、多摩モノレール、ゆりかもめ、横浜市営地下鉄、京都市営地下鉄のODPT提供分。既存の今出川駅データは引き続き使用できます。</p>
   <p>函館市電（2・5系統）：データ取得・変換確認済み。<a href="https://gtfs-jp.org/GTFS-RUL(ODPT).pdf" target="_blank" rel="noreferrer">提供元の利用条件</a>で一般公開前の通知・承認が必要なため、アプリへの同梱は保留しています。</p>
   <p>駅ナンバリングなどのPDFは時刻表ではないため、発車案内の取り込み対象から除外しています。JR貨物のコンテナ時刻表も旅客向け発車案内の対象外です。</p>
  </details>
  <p><a href="https://challenge2026.odpt.org/" target="_blank" rel="noreferrer">公共交通オープンデータチャレンジ2026</a> · <a href="https://ckan.odpt.org/dataset/?tags=%E9%89%84%E9%81%93-railway" target="_blank" rel="noreferrer">ODPT鉄道データカタログ</a></p>
 </section>;
}

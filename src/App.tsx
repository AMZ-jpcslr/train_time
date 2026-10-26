import { useEffect, useMemo, useRef, useState } from 'react';
import {bundledTables} from './data/bundled';
import {entrances} from './data/entrances';
import { stations as baseStations } from './data/stations';
import type { Timetable, SavedPlace } from './domain/types';
import { addDays, availability, dayType, formatClock, selectTable, serviceDate, upcoming } from './domain/time';
import { distanceKm, judge, positionStatus, routeMinutes, type Walking } from './domain/journey';
import {useGeolocation} from './useGeolocation';
import LocationHelp from './LocationHelp';
import StationPicker from './StationPicker';
import DataCoverage from './DataCoverage';
import KansaiCoverage from './KansaiCoverage';
import ActionDecision from './ActionDecision';
import {useStationTimetables} from './useStationTimetables';
import {useChallengeCatalog} from './useChallengeCatalog';
import {useWesternStations} from './useWesternStations';
import DepartureTimeline from './DepartureTimeline';
import TrainTypeBadge from './TrainTypeBadge';
import {serviceTimeline,recommendedTrain} from './domain/timeline';
import {useTrainSelection,departureRank} from './useTrainSelection';
import ChoicePicker from './ChoicePicker';
import InstallApp from './InstallApp';
import PwaUpdate from './PwaUpdate';
import WidgetTransfer from './WidgetTransfer';
import {widgetDepartureId} from './domain/widget';
import {googleWalkingUrl,needsAccessCheck} from './domain/routing';
import {useWalking} from './useWalking';
import {useTimetables} from './useTimetables';
import {useRuntimeConfig} from './useRuntimeConfig';
import RouteDiagram from './RouteDiagram';
import { defaults, load, save } from './domain/storage';
const availabilityLabels={ready:'実データ・出典照合済',missing:'未取得',expired:'ダイヤ適用期間外 / 要再確認',unverified:'現行未確認・参考時刻',special:'特定日のダイヤ未確認','calendar-unknown':'祝日データの対象年外'};
const icon=(name:string)=> name==='train'?<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M9 3v7M15 3v7M8 18l-2 3m10-3 2 3M8 14h1m6 0h1"/></svg>:<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>;

export default function App({comparison=false}:{comparison?:boolean}){
 const [stored,setStored]=useState(()=>comparison?{...defaults,favorites:['kobe-gakuentoshi:east','kyoto-imadegawa:north'],places:[{id:'comparison-home',stationId:'kobe-gakuentoshi',name:'比較用の出発地点',entrance:'比較用の駅入口',walkMinutes:8}]}:load());
 const manualFallback=useRef<HTMLDetailsElement>(null);
 const decisionHeading=useRef<HTMLHeadingElement>(null);
 const [choiceNotice,setChoiceNotice]=useState('');
 const [now,setNow]=useState(Date.now());
 const {position,locating,message:locationMessage,start:startLocation,cancel:cancelLocation}=useGeolocation();
 const [placeId,setPlaceId]=useState(comparison?'comparison-home':'');
 const [showSettings,setShowSettings]=useState(false);
 const [showSources,setShowSources]=useState(false);
 const [savingError,setSavingError]=useState(false);
 const [preview,setPreview]=useState(comparison?'2026-10-26T14:00':'');
 const [newPlace,setNewPlace]=useState({name:'',entrance:'',minutes:''});
 const [formError,setFormError]=useState('');
 const [entranceId,setEntranceId]=useState('');
 const routingConfig=useRuntimeConfig();
 const challenge=useChallengeCatalog(Boolean(routingConfig?.odptChallenge?.enabled),now);
 const western=useWesternStations(stored.stationId,stored.stationFavorites??[],stored.favorites);
 const stations=useMemo(()=>[...baseStations,...challenge.stations,...western.stations],[challenge.stations,western.stations]);
 useEffect(()=>{const tick=()=>setNow(Date.now()); const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);window.addEventListener('pageshow',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('pageshow',tick);};},[]);
 useEffect(()=>{if(!comparison)setSavingError(!save(stored));},[stored,comparison]);
 const time=preview?Date.parse(preview+':00+09:00'):now;
 const station=stations.find(s=>s.id===stored.stationId)??stations[0];
 const pendingSavedStation=stored.stationId.startsWith('challenge-')&&!stations.some(s=>s.id===stored.stationId);
 const direction=station.directions.find(d=>d.id===stored.directionId)??station.directions[0];
 const day=serviceDate(time);
 const timetableFeed=useTimetables(bundledTables,station.id,day,now);
 const stationFeed=useStationTimetables(station,day,now);
 const tables=useMemo(()=>[...timetableFeed.tables,...stationFeed.tables],[timetableFeed.tables,stationFeed.tables]);
 const table=selectTable(tables,station.id,direction.id,day);
 const directionTables=tables.filter(t=>t.stationId===station.id&&t.directionId===direction.id);
 const coverageDates=[...new Set(directionTables.flatMap(t=>t.serviceDates??[]))];
 const coverageDays=[...new Set(directionTables.filter(t=>!t.serviceDates).map(t=>({weekday:'平日',saturday:'土曜',holiday:'休日',weekend:'土曜・休日'})[t.dayType]))];
 const state=pendingSavedStation?'missing':availability(table,day,now);
 const fallbackReady=station.id!=='kobe-gakuentoshi'&&availability(selectTable(tables,'kobe-gakuentoshi','east',day),day,now)==='ready';
 useEffect(()=>setChoiceNotice(''),[station.id,direction.id,day,preview]);
 const referenceOnly=state==='unverified'&&table?.verification==='partial';
 const timeline=useMemo(()=>(state==='ready'||referenceOnly)?serviceTimeline(table,day):[],[table,day,state,referenceOnly]);
 const departures=timeline.filter(train=>train.epoch>time);
 const tomorrowTable=selectTable(tables,station.id,direction.id,addDays(day,1));
 const tomorrow=departures.length===0 && state==='ready' && tomorrowTable && availability(tomorrowTable,addDays(day,1),now)==='ready'?upcoming(tomorrowTable,addDays(day,1),time,1)[0]:undefined;
 const place=stored.places.find(p=>p.id===placeId&&p.stationId===station.id);
 const stationEntrances=entrances.filter(e=>e.stationId===station.id).sort((a,b)=>position?distanceKm(position,a)-distanceKm(position,b):0);
 const entrance=stationEntrances.find(e=>e.id===entranceId)??stationEntrances[0];
 const walking=useWalking(place||locating?null:position,entrance,now);
 const accessUnverified=walking.route?needsAccessCheck(walking.route):false;
 const calculatedMinutes=walking.route?routeMinutes(walking.route,stored.settings.speedKmh):null;
 const walk:Walking=place?{kind:'measured',minutes:place.walkMinutes}:calculatedMinutes!==null?{kind:accessUnverified?'estimate':'route',minutes:calculatedMinutes}:{kind:'unavailable'};
 const walkMinutes='minutes' in walk?walk.minutes:null;
 const selection=useTrainSelection(departures,`${station.id}:${direction.id}:${day}:${preview||'live'}`,time);
 const first=selection.selected;
 const focusDecision=()=>{
  decisionHeading.current?.focus({preventScroll:true});
  decisionHeading.current?.closest('.decision-summary')?.scrollIntoView({block:'start'});
 };
 useEffect(()=>{if(place?.id)focusDecision();},[place?.id]);
 const judgmentWalk:Walking=state==='ready'?walk:{kind:'unavailable'};
 const firstJudge=first?judge(first.epoch,time,judgmentWalk,stored.settings):null;
 // Reconsider the initial target when walking conditions change, not on each clock tick.
 useEffect(()=>{const target=(!comparison&&timeline.find(t=>t.epoch>time&&judge(t.epoch,time,judgmentWalk,stored.settings).status==='comfortable'))||recommendedTrain(timeline,time,judgmentWalk,stored.settings);if(target&&target!==departures[0])selection.select(target);},[walkMinutes,walk.kind,stored.settings.stationMinutes,station.id,direction.id,day,preview,state,comparison]);
 const selectTrain=(train:typeof first)=>{
  if(!train)return;
  selection.select(train);setChoiceNotice(`${train.time}発 ${train.destination}行きに変更しました。出発目安を確認してください。`);
  focusDecision();
 };
 const openManual=()=>{
  if(!manualFallback.current)return;
  manualFallback.current.open=true;
  if(stored.places.some(p=>p.stationId===station.id)){
   manualFallback.current.querySelector<HTMLButtonElement>('.choice-trigger')?.focus();
  }else{
   const form=manualFallback.current.querySelector<HTMLDetailsElement>('.place-form');
   if(form){form.open=true;form.querySelector<HTMLInputElement>('input')?.focus();}
  }
 };
 const favoriteKey=station.id+':'+direction.id;
 const isFavorite=stored.favorites.includes(favoriteKey);
 const posState=positionStatus(position,now);
 const locationJudgmentMessage=locationMessage.includes('拒否')||locationMessage.includes('取得できません')||locationMessage.includes('タイムアウト')?locationMessage:locating?'より正確な位置を確認しています。取得後に徒歩経路を計算します。':posState==='inaccurate'?'現在地の誤差が大きいため、出発目安を計算できません。位置情報の案内を確認してください。':posState==='stale'?'現在地が古くなっています。もう一度「現在地を更新」を押してください。':accessUnverified?'道路までの接続区間が未確認のため、徒歩時間は概算です。出発目安は計算できません。':walking.error?'徒歩経路を取得できませんでした。入口の切替やGoogleマップで確認できます。':!entrance?'この駅の入口位置は未確認です。「実測時間を使う」から登録してください。':'現在地を更新すると、歩行経路から徒歩時間を計算します。';
 const nearby=position?[...stations].sort((a,b)=>distanceKm(position,a)-distanceKm(position,b)).slice(0,3):[];
 const chooseStation=(id:string,dir?:string)=>{const s=stations.find(s=>s.id===id)!;setStored({...stored,stationId:id,directionId:dir??s.directions[0].id});setPlaceId('');setEntranceId('');if(!comparison)focusDecision();};
 const toggleFavorite=()=>setStored(previous=>({...previous,favorites:previous.favorites.includes(favoriteKey)?previous.favorites.filter(f=>f!==favoriteKey):[...previous.favorites,favoriteKey]}));
 const toggleStationFavorite=(id:string)=>setStored(previous=>({...previous,stationFavorites:(previous.stationFavorites??[]).includes(id)?previous.stationFavorites!.filter(s=>s!==id):[...(previous.stationFavorites??[]),id]}));
 const locate=()=>{setPlaceId('');startLocation();};
 const addPlace=(e:React.FormEvent)=>{e.preventDefault();const minutes=Number(newPlace.minutes);if(!newPlace.name.trim()||!newPlace.entrance.trim()||newPlace.minutes===''||!Number.isFinite(minutes)||minutes<0||minutes>240){setFormError('地点名・駅入口名・0〜240分の実測徒歩時間を入力してください。');return;}const p:SavedPlace={id:crypto.randomUUID(),name:newPlace.name.trim(),entrance:newPlace.entrance.trim(),walkMinutes:minutes,stationId:station.id};setStored({...stored,places:[...stored.places,p]});setPlaceId(p.id);setNewPlace({name:'',entrance:'',minutes:''});setFormError('');decisionHeading.current?.focus();};
 const countdown=(epoch:number)=>{const sec=Math.max(0,Math.ceil((epoch-time)/1000));return sec<60?`${sec}秒`:`${Math.floor(sec/60)}分${String(sec%60).padStart(2,'0')}秒`;};
 const locationActions=<div className="location-actions"><button className="location-button" onClick={locate} disabled={locating}>{icon('location')}{locating?'取得中…':'現在地を更新'}</button>{locating&&<button className="location-cancel" onClick={()=>cancelLocation()}>取得を中止</button>}</div>;
 const dayLabel=dayType(day)==='weekday'?'平日':dayType(day)==='saturday'?'土曜日':dayType(day)==='holiday'?'休日':'曜日区分未確認';
 const openConditions=()=>{setShowSettings(true);const target=document.getElementById('walking-settings');target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});};
 return <div className={'app-shell'+(comparison?'':' action-live')}>
  {comparison&&<aside className="alert">現行UIの比較用表示 · 10/26 14:00 · 徒歩8分＋構内3分。通常の保存設定は変更しません。<a href="/?design=board">A 発車案内</a> / <a href="/?design=action">B 出発目安</a> / <a href="/?design=favorites">C いつもの駅</a></aside>}
  <header className="topbar"><a className="brand" href="/" aria-label="まにあう ホーム"><span className="brand-mark">{icon('train')}</span><span>まにあう<span className="brand-sub">次の電車と、歩く時間。</span></span></a>{comparison&&<span className="prototype">{routingConfig?.deployment==='vercel'?'WEB PROTOTYPE':'LOCAL PROTOTYPE'} <span className="live-dot"/></span>}</header>
  <main>
   <div className="page-heading"><div>{comparison&&<span className="eyebrow">DEPARTURE BOARD</span>}<h1>{comparison?'次の電車、歩いて間に合う？':'いつ出よう。'}</h1></div><div className="clock"><span>{preview?'指定時刻 / JST':'現在時刻 / JST'}</span><strong>{formatClock(time).slice(0,5)}</strong><small>{day} 運行日 · {dayLabel}</small></div></div>
   {preview&&<div className="alert">時刻指定プレビュー：実時刻ではありません。実データを指定時刻で確認しています。<button onClick={()=>setPreview('')}>現在に戻す</button></div>}
   {savingError&&<div className="alert" role="alert">端末内保存に失敗しました。この画面を閉じると設定が失われる可能性があります。</div>}
   <section className="decision-summary" aria-label="出発判断">
    <div className="decision-heading"><h2 ref={decisionHeading} tabIndex={-1}>出発判断</h2><a href="#walking-settings">徒歩条件 ↓</a></div>
     <div className="station-controls" id="station-controls"><div className="station-badge">{station.code}</div><StationPicker stations={stations} station={station} onChange={chooseStation} favorites={stored.stationFavorites??[]} onFavorite={toggleStationFavorite} onWesternSearch={routingConfig?.western?.enabled?western.search:undefined} westernLoading={western.loading} westernMessage={western.message} westernError={western.error}/><button className={'favorite '+(isFavorite?'active':'')} onClick={toggleFavorite} aria-pressed={isFavorite} aria-label="この駅と方面をお気に入り">{isFavorite?'★':'☆'}</button></div>
     <div className="line-info"><span className="line-dot"/>{station.operator} <span>/</span> {station.line}</div>
     {challenge.loading&&<p className="small-note" role="status">認証付きの駅データを確認中：{challenge.active}。取得できた駅から検索に追加します。</p>}
     {pendingSavedStation&&<p className="alert" role="status">保存した認証付きの駅はまだ読み込めていません。取得が完了するまで発車・徒歩判定を停止しています。別の駅を検索して選ぶこともできます。</p>}
     <div className="direction-tabs" aria-label="方面">{station.directions.map(d=><button key={d.id} className={d.id===direction.id?'selected':''} aria-pressed={d.id===direction.id} onClick={()=>setStored({...stored,directionId:d.id})}>{d.name}<span>↗</span></button>)}</div>
    {station.timetablePath&&<p className="small-note"><a href="#data-coverage">対応路線・データの範囲を確認 ↓</a></p>}
    {(stationFeed.loading||stationFeed.error)&&<div className="odpt-feed-message" role="status">{stationFeed.loading?"選択した駅の時刻表を読み込んでいます…":stationFeed.error}{stationFeed.error&&<button onClick={stationFeed.retry}>時刻表を再読み込み</button>}</div>}
    <p className="decision-station"><strong>{station.name}</strong> · {direction.name}</p>
    <p className="decision-constraint">定刻ベース・遅延／運休は未反映。乗車を保証しません。</p>
    {firstJudge?.status==='unknown'&&<><p className="decision-location-note">{referenceOnly?'現行ダイヤ未確認のため、公式時刻表を確認してください。':walking.loading?'徒歩経路を計算しています。':locationJudgmentMessage}</p>{locationActions}<button className="manual-shortcut" onClick={openManual}>実測時間を使う</button></>}
    {!comparison&&first&&<ActionDecision train={first} now={time} walk={judgmentWalk} settings={stored.settings} stationId={station.id} placeName={place?.name} preview={Boolean(preview)} onConditions={openConditions} rank={selection.index}/>}
    {!first&&<p className="decision-empty">{state==='ready'?'この運行日の発車は終了しました':availabilityLabels[state]}。<a href="#timetable-details">時刻表の状態・次の操作を確認 ↓</a></p>}
    {!comparison&&timeline.length>0&&<h3 className="action-other-trains">{first?'ほかの便を選ぶ':'この運行日の時刻表'}</h3>}
    {timeline.length>0&&<DepartureTimeline key={`${station.id}/${direction.id}/${day}`} trains={timeline} selected={first} now={time} walk={judgmentWalk} settings={stored.settings} station={station} directionId={direction.id} day={day} placeName={place?.name} preview={Boolean(preview)} onSelect={selectTrain} compact={!comparison}/>}
    {first&&<div className="decision-actions">{firstJudge?.status!=='unknown'&&<button onClick={openManual}>実測時間を使う</button>}<a href="#walking-settings">徒歩条件を確認 ↓</a></div>}
   </section>
   <p className="sr-only" role="status">{choiceNotice}</p>
   <section className="location-panel" aria-label="現在地と徒歩検索"><div className="location-heading">{comparison&&<span className="eyebrow">01 / YOUR LOCATION</span>}<h2>現在地から徒歩時間を計算</h2></div>{!(first&&firstJudge?.status==='unknown')&&locationActions}<p className="location-status" role="status">{locationMessage}</p>
     {position&&<><p className="small-note location-accuracy">推定誤差 半径約{Math.round(position.accuracy)}m · {Math.max(0,Math.floor((now-position.timestamp)/60000))}分前{posState==='stale'?' · 現在地が古いため更新してください':posState==='inaccurate'?locating?' · 位置精度が低いため改善を待っています':' · 位置精度が低いため徒歩判定はできません':''}</p></>}
     {!locating&&posState==='inaccurate'&&<LocationHelp/>}
<details className="location-privacy"><summary>位置情報の取り扱い</summary><p className="small-note">現在地の取得後、座標と選んだ駅入口を{routingConfig?.provider??'設定済みの徒歩経路サービス'}へ送信します。アプリは現在地の履歴を保存しません。経路提供先のアクセスログには記録される場合があります。</p></details></section>
   <div className="quick-access" id="favorite-stations" tabIndex={-1}>
   {(stored.stationFavorites??[]).length>0&&<section className="favorites-section station-favorite-chips" aria-label="お気に入りの駅"><div><h2>お気に入りの駅</h2><p>検索結果の☆から登録できます。</p></div><div className="favorite-chips">{(stored.stationFavorites??[]).map(id=>{const s=stations.find(s=>s.id===id);return s?<button key={id} onClick={()=>chooseStation(id)} aria-pressed={id===station.id}><span>★ {s.name}</span><small>{s.operator} · {s.line}</small></button>:null;})}</div></section>}
   <section className="favorites-section" aria-label="お気に入りの駅と方面"><div><h2>いつもの駅・方面</h2><p>駅と方面を☆で登録すると、次回もここから選べます。</p></div><div className="favorite-chips">{stored.favorites.length?stored.favorites.map(key=>{const [sid,did]=key.split(':');const s=stations.find(s=>s.id===sid);const d=s?.directions.find(d=>d.id===did);return s&&d?<button key={key} onClick={()=>chooseStation(sid,did)} aria-pressed={favoriteKey===key}><span>★ {s.name}</span><small>{d.name}</small></button>:null;}):<span className="muted">お気に入りはまだありません</span>}</div></section>
   </div>
   <div className="dashboard">
    <section className="board-section" id="timetable-details" aria-label="発車案内">
     {directionTables.length>0&&<p className="small-note" data-testid="data-coverage">この方面の収録範囲：{station.timetablePath?`${[...coverageDates].sort()[0]}〜${[...coverageDates].sort().at(-1)}（運行日カレンダーに従う）`:[...coverageDates,...coverageDays].join('、')}{!station.timetablePath&&coverageDates.length>0?' の運行日限定':''}。{directionTables.some(t=>t.verification==='partial')?'現行適用・検証に未確認事項があります。':''}</p>}
     {timetableFeed.message&&<div className="timetable-update" role="status">{timetableFeed.message}<button disabled={timetableFeed.loading} onClick={timetableFeed.refresh}>日付別時刻表を更新</button></div>}
     {selection.notice&&<p className="selection-notice" role="status">{selection.notice}</p>}
     <div className="departure-board"><div className="board-top"><span><i className="live-dot"/> {referenceOnly?'参考時刻（現行未確認）':'発車予定'}</span><span>定刻の時刻表</span></div>
      {referenceOnly&&<div className="alert" role="status">現在のダイヤに合うか、内容が正しいかを確認できていない参考時刻です。徒歩経路が取得できても、この時刻表では出発目安を計算できません。</div>}
      {first?<>{comparison?<div className="next-train"><div className="train-meta"><span className="pill">{departureRank(selection.index)} · 選択中</span><TrainTypeBadge stationId={station.id} type={first.trainType}/><span className="platform">{first.platform?`${first.platform}番線`:'番線未確認'}</span></div><div className="destination-row"><div><h2>{first.destination}<small>{first.destination==='行先未収録'?'（公式で確認）':'行き'}</small></h2><p>{first.time} 発</p></div><div className="big-countdown"><span>{referenceOnly?'参考時刻まで':'発車まで'}</span><strong>{countdown(first.epoch).split('分')[0]}<small>{countdown(first.epoch).includes('分')?'分':''}</small></strong>{countdown(first.epoch).includes('分')&&<span className="seconds">{countdown(first.epoch).split('分')[1]}</span>}</div></div>

      </div>:<p className="action-source-recap">選択中：{first.time}発 {first.destination}行き。<a href="#station-controls">出発目安へ戻る ↑</a></p>}</>:<div className="empty-state"><span className="empty-icon">{icon('train')}</span><h2>{state==='ready'?'この運行日の発車は終了しました':availabilityLabels[state]}</h2><p>{state==='missing'?'この駅・方面・運行日の時刻表がありません。別の日の時刻表では計算できません。':state==='expired'?'適用期間外、または確認期限を過ぎています。再確認まで出発目安は表示しません。':state==='special'?'この日の特別ダイヤを確認できていません。公式の時刻表を確認してください。':state==='ready'?'24時以降の便も含め、収録された発車予定はすべて過ぎています。':'確認できた時刻表が必要です。'}</p>{tomorrow&&<p>次の運行日 {addDays(day,1)} の始発：<b>{tomorrow.time} {tomorrow.destination}行き</b></p>}<a href={station.sourceUrl} target="_blank" rel="noreferrer">公式の駅情報を確認 ↗</a>{state!=='ready'&&fallbackReady&&<button onClick={()=>chooseStation('kobe-gakuentoshi')}>取得済みの学園都市を表示</button>}</div>}
      <div className="board-footer"><span>◷ 時刻表に基づく予定。遅延・運休は未反映</span><button onClick={()=>setShowSources(!showSources)}>出典・確認日 ↗</button></div>
     </div>
     <p className="disclaimer">判定は目安であり、乗車を保証するものではありません。駆け込み乗車はお控えください。</p>
    </section>
    <aside className="journey-panel" id="walking-settings" tabIndex={-1}><div className="panel-title">{comparison&&<span className="eyebrow">YOUR WALK</span>}<h2>駅までの道のり</h2></div>{position&&<div className="nearby">{nearby.map(s=><button key={s.id} onClick={()=>chooseStation(s.id)}>{s.name}<small>直線 約{distanceKm(position,s).toFixed(1)}km</small></button>)}</div>}
     <div className="entrance-field"><ChoicePicker label="歩いて向かう駅入口" value={entrance?.id??''} options={stationEntrances.map(e=>({id:e.id,label:e.name,description:station.name}))} emptyText="この駅の入口座標は未確認" onChange={id=>{setEntranceId(id);setPlaceId('');}}/></div>
     {entrance&&<p className="small-note"><a href={entrance.sourceUrl} target="_blank" rel="noreferrer">入口の地図情報 ↗</a>{entrance.osm&&<> · <a href={entrance.osm.featureUrl} target="_blank" rel="noreferrer">駅との対応根拠 ↗</a></>}{entrance.officialSourceUrl&&<> · <a href={entrance.officialSourceUrl} target="_blank" rel="noreferrer">事業者の公式案内 ↗</a></>} · {stationEntrances.length}地点収録。選択肢の先頭は現在地から直線で近い入口です。最短の歩行経路を保証しません。{entrance.osm&&<> 入口情報：{entrance.checkedAt.slice(0,10)}取得、© OpenStreetMap contributors（ODbL）。</>}</p>}
     {walking.loading&&<p role="status" className="route-status">歩行者用の道路経路を計算しています…</p>}
     {walking.error&&!place&&<><p role="alert" className="route-error">経路取得失敗：{walking.error}</p><button className="route-retry" onClick={walking.refresh} disabled={walking.loading||locating||posState!=='fresh'}>徒歩経路を再取得</button></>}
     {!entrance&&<p role="status" className="route-error">入口位置を確認できていないため、この駅までの徒歩時間は自動計算できません。</p>}
     <div className="walk-summary"><span>{place?`登録地点「${place.name}」から駅入口までの徒歩`:!place&&accessUnverified?'現在地から駅入口までの徒歩（接続区間は概算）':'現在地から駅入口までの徒歩'}</span><strong>{!place&&accessUnverified&&<small>約 </small>}{walkMinutes??'—'}<small>分</small></strong><span>{place?`登録地点の実測時間 · ${place.entrance}`:walking.route?`道路経路 約${Math.ceil(walking.route.roadDistanceMeters)}m · ${entrance?.name}`:!entrance?'駅入口が未確認のため実測時間を登録してください':'「現在地を更新」で自動計算'}</span></div>
     {walking.route&&!place&&<div className={'route-access '+(accessUnverified?'unverified':'')} role={accessUnverified?'status':undefined}><p>道路までの接続：出発側 約{Math.ceil(walking.route.snapDistances[0])}m ／ 入口側 約{Math.ceil(walking.route.snapDistances[1])}m</p>{accessUnverified&&<p>上の徒歩時間は、道路経路に接続区間の直線距離を加えた概算です。建物の出口・階段・柵・横断箇所を確認できていないため、実際は遠回りになる場合があります。Googleマップや現地で経路を確認してください。</p>}</div>}
     <div className="time-breakdown"><div><span>入口からホームへ（乗車までの余裕を含む）</span><b>{stored.settings.stationMinutes}分</b></div><div className="total"><span>合計の所要時間</span><b>{walkMinutes===null?'—':walkMinutes+stored.settings.stationMinutes}分</b></div></div>
     {walking.route&&!place&&<><RouteDiagram route={walking.route}/><p className="small-note">設定歩行速度 {stored.settings.speedKmh}km/h。地図上の歩行経路に基づく目安です。階段・信号待ち・混雑・工事や入口の開閉で変わります。{entrance?.note}</p><a className="route-map-link" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${position?.lat}%2C${position?.lon}%3B${entrance?.lat}%2C${entrance?.lon}`} target="_blank" rel="noreferrer">経路を地図で確認 ↗</a></>}
     {position&&entrance&&posState==='fresh'&&!locating&&!place&&<div className="google-walking"><a href={googleWalkingUrl(position,entrance)} target="_blank" rel="noreferrer">Googleマップで徒歩経路を見る ↗</a><p>押すと現在地と選択した駅入口をGoogleへ渡して、徒歩経路を開きます。Google側の時間はこの画面に自動反映されません。</p></div>}
     <details className="manual-fallback" ref={manualFallback}><summary>登録地点の実測時間を使う</summary><ChoicePicker label="出発地点" value={place?.id??''} options={[{id:'',label:'現在地から自動計算する',description:'位置情報と歩行経路を使用'},...stored.places.filter(p=>p.stationId===station.id).map(p=>({id:p.id,label:p.name,description:`${p.entrance} · 実測${p.walkMinutes}分`}))]} onChange={setPlaceId}/>
     <details className="place-form"><summary>位置情報を使えないとき：実測地点を登録</summary><form onSubmit={addPlace}><label className="field"><span>地点名</span><input value={newPlace.name} maxLength={40} placeholder="自宅、会社など" onChange={e=>setNewPlace({...newPlace,name:e.target.value})}/></label><label className="field"><span>到着する駅入口</span><input value={newPlace.entrance} maxLength={60} placeholder="例：北口（実際に使う入口）" onChange={e=>setNewPlace({...newPlace,entrance:e.target.value})}/></label><label className="field"><span>入口までの実測徒歩時間（分）</span><input type="number" min="0" max="240" step="0.5" value={newPlace.minutes} placeholder="例：8" onChange={e=>setNewPlace({...newPlace,minutes:e.target.value})}/></label><p className="small-note">選択中の駅専用に保存します。利用時は、その地点にいることを確認してください。</p>{formError&&<p role="alert">{formError}</p>}<button className="primary-button" type="submit">端末に保存して使う</button></form></details>
     {place&&<p className="small-note">登録地点「{place.name}」にいる場合の計算です。実際にこの地点にいることを確認してください。</p>}
     {place&&<button className="text-button" onClick={()=>{setStored({...stored,places:stored.places.filter(p=>p.id!==place.id)});setPlaceId('');}}>この登録地点を削除</button>}
     </details>
     <button className="settings-button" aria-expanded={showSettings} onClick={()=>setShowSettings(!showSettings)}>☷ 徒歩・駅構内時間の設定<span>{showSettings?'−':'＋'}</span></button>
     {showSettings&&<div className="settings-fields">{([{key:'stationMinutes',label:'入口からホームまで（分）',min:0,max:60,step:1},{key:'speedKmh',label:'歩行速度（km/h）',min:1,max:6,step:0.1}] as const).map(s=><label className="field" key={s.key}><span>{s.label}</span><input type="number" min={s.min} max={s.max} step={s.step} value={stored.settings[s.key]} onChange={e=>{const value=e.target.valueAsNumber;if(Number.isFinite(value)&&value>=s.min&&value<=s.max)setStored({...stored,settings:{...stored.settings,[s.key]:value}});}}/></label>)}<p className="small-note">入口からホームまでの時間には、乗車までの余裕を含めて設定してください。別枠の加算はありません。道路の歩行経路にこの速度を適用します。実測登録地点の時間は変えません。走行の試算ではありません。</p><label className="field"><span>日時を指定して試す（日本時間）</span><input aria-label="時刻指定プレビュー" type="datetime-local" value={preview} onChange={e=>setPreview(e.target.value)}/></label>{preview&&<button onClick={()=>setPreview('')}>実時刻に戻す</button>}</div>}
     <div className="route-note"><b>徒歩経路：{routingConfig?.enabled?`${routingConfig.provider} 設定済み`:'サーバー設定を確認してください'}</b>{routingConfig?.disabledReason&&<p role="status">{routingConfig.disabledReason}</p>}<p>{routingConfig?.deployment==='vercel'?'少人数向けの試用接続。全体の取得回数を制限します。':'無料のローカル試用接続。連続取得を抑えます。'}同じ経路の取得結果は10分間再利用します。</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>（<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>） · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">地図の誤りを報告</a>{routingConfig?.privacyUrl&&<> · <a href={routingConfig.privacyUrl} target="_blank" rel="noreferrer">経路サービスの条件・プライバシー</a></>}</p>{routingConfig?.contactEmail&&<p>このアプリの連絡先：<a href={'mailto:'+routingConfig.contactEmail}>{routingConfig.contactEmail}</a></p>}</div>
     {position&&<p className="small-note">駅中心まで直線 約{distanceKm(position,station).toFixed(2)}km。近隣駅の候補表示用であり、乗車判定には使いません。</p>}
    </aside>
   </div>
   <WidgetTransfer input={{now,preview:Boolean(preview),station,directionName:direction.name,table,settings:stored.settings,position:locating?null:position,route:walking.route,entrance,place,selectedId:first?widgetDepartureId(first):undefined}}/>
   <InstallApp/>
   {showSources&&<section className="sources" aria-label="出典とデータ対応状況"><h2>出典とデータ対応状況</h2><p>選択中：{availabilityLabels[state]}。確認日と掲載改正日を区別しています。JRは取得から6時間、曜日別時刻表は確認から30日で再確認が必要です。臨時運転の網羅は未確認です。</p>{table&&<div className="source-detail"><p>対象運行日：{station.timetablePath?`${table.validFrom}〜${table.validTo}のうち${table.serviceDates?.length}日（選択日 ${day}）`:table.serviceDates?.join('、')??`曜日別（${table.dayType}）`} ／ 検証状態：{table.verification==='verified'?'出典照合済':table.verification==='partial'?'一部検証・現行未確認':'未検証'}</p>{table.sourceAcquisition?.kind==='retained-official-download'?<p>保存済み原本の取込：{table.sourceAcquisition.importedAt} ／ 元のダウンロード日時：{table.sourceAcquisition.downloadedAt??'記録なし'}<br/>元ファイルの更新日時：{table.sourceAcquisition.fileModifiedAt}（取得日時とは別）</p>:<p>取得：{table.retrievedAt}</p>}<p>確認：{table.checkedAt} ／ 掲載改正：{table.revisionDate??'不明'} ／ 適用：{table.validFrom??'不明'} 〜 {table.validTo??'終了日未公表'}</p><a href={table.sourceUrl} target="_blank" rel="noreferrer">選択中の時刻表出典 ↗</a><ul>{table.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></div>}<div className="coverage-grid">{stations.filter(s=>!s.timetablePath).map(s=>{const acquired=tables.filter(t=>t.stationId===s.id);const count=acquired.length;const checked=acquired.filter(t=>t.verification==='verified').length;const available=s.directions.filter(d=>availability(selectTable(tables,s.id,d.id,day),day,now)==='ready').length;return <div key={s.id}><strong>{s.name}</strong><span>{s.operator} / {s.line}</span><b>{count?`${count}表を取得済 / ${checked===count?'出典照合済':'現行未確認あり'}`:'未取得・取込保留'}</b>{count>0&&<small>{available?`選択運行日に利用可：${available}方面`:'選択運行日は判定不可'}</small>}<a href={s.sourceUrl} target="_blank" rel="noreferrer">公式ページ ↗</a></div>;})}</div><p>出典：神戸市交通局「地下鉄オープンデータ」を加工。<a href="https://creativecommons.org/licenses/by/2.1/jp/" target="_blank" rel="noreferrer">CC BY 2.1 JP</a>。祝日：<a href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html" target="_blank" rel="noreferrer">内閣府</a>。詳細な取得・保留理由は同梱README参照。</p></section>}
   <DataCoverage stations={stations} challenge={challenge.coverage} challengeErrors={challenge.errors} challengeLoading={challenge.loading} challengeEnabled={Boolean(routingConfig?.odptChallenge?.enabled)} onRetry={challenge.retry} westernCoverage={routingConfig?.western?.enabled?routingConfig.western.coverage:[]} kansai={<KansaiCoverage stations={stations} tables={tables} day={day} now={now}/>}/>
   <PwaUpdate/>
  </main><footer className="site-footer"><span>まにあう <small> / 予定を知って、余裕をつくる。</small></span><span>現在地は経路計算時だけ送信 · アカウント不要</span><span>ホーム画面に追加できます / ウィジェットは専用アプリが必要</span></footer>
 {!comparison&&<nav className="action-bottom-nav" aria-label="よく使う操作"><button onClick={()=>{const target=document.getElementById('favorite-stations');target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});}}>☆ お気に入り</button><button onClick={()=>document.querySelector<HTMLButtonElement>('#station-controls .station-trigger')?.click()}>駅・方面</button><button onClick={openConditions}>徒歩時間</button></nav>}
 </div>;
}

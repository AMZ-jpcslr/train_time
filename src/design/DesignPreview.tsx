import {useEffect, useRef, useState} from 'react';
import {stations as catalog} from '../data/stations';
import {bundledTables} from '../data/bundled';
import {judge} from '../domain/journey';
import {previewModel, scenarioLabels, statusCopy, type Design, type Scenario} from './previewModel';
import './design-preview.css';

const variants:Record<Design,{name:string;note:string}>={board:{name:'A 発車案内',note:'便を並べて選ぶ'},action:{name:'B 出発目安',note:'次の行動から決める'},favorites:{name:'C いつもの駅',note:'保存した駅から開く'}};
const clock=(epoch:number)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(epoch);
type Favorite={stationId:string;directionId:string};
const initialFavorites:Favorite[]=[{stationId:'kobe-gakuentoshi',directionId:'east'},{stationId:'kyoto-imadegawa',directionId:'north'}];
type PreviewState={stationId:string;directionId:string;walk:number|null;inside:number;favorites:Favorite[]};
const initial:PreviewState={stationId:'kobe-gakuentoshi',directionId:'east',walk:8,inside:3,favorites:initialFavorites};
function restore(design:Design):PreviewState {
 try{const v=JSON.parse(sessionStorage.getItem('mania-u:design-review:'+design)||'null');if(v&&catalog.some(s=>s.id===v.stationId&&s.directions.some(d=>d.id===v.directionId))&&(v.walk===null||Number.isFinite(v.walk)&&v.walk>=0&&v.walk<=240)&&Number.isFinite(v.inside)&&v.inside>=0&&v.inside<=60&&Array.isArray(v.favorites)&&v.favorites.every((f:Favorite)=>catalog.some(s=>s.id===f.stationId&&s.directions.some(d=>d.id===f.directionId))))return v;}catch{/* A review must remain usable without storage. */}return initial;
}
export default function DesignPreview({design}:{design:Design}){
 const [state,setState]=useState(()=>restore(design));
 const [scenario,setScenario]=useState<Scenario>('normal');
 const [selectedTime,setSelectedTime]=useState<string|null>(null);
 const [panel,setPanel]=useState<'station'|'conditions'|'favorites'|null>(null);
 const [query,setQuery]=useState('');
 const [showPast,setShowPast]=useState(false);
 const [notice,setNotice]=useState('');
 const [storageError,setStorageError]=useState(false);
 const [online,setOnline]=useState(navigator.onLine);
 const dialog=useRef<HTMLDialogElement>(null);
 const returnFocus=useRef<HTMLElement|null>(null);
 const selectedRow=useRef<HTMLButtonElement|null>(null);
 const station=catalog.find(s=>s.id===state.stationId)!;
 const direction=station.directions.find(d=>d.id===state.directionId)??station.directions[0];
 const model=previewModel(bundledTables,station.id,direction.id,!online&&scenario==='normal'?'offline':scenario,state.walk,state.inside,selectedTime);
 const activeFavorite=state.favorites.some(f=>f.stationId===station.id&&f.directionId===direction.id);
 useEffect(()=>{try{sessionStorage.setItem('mania-u:design-review:'+design,JSON.stringify(state));setStorageError(false);}catch{setStorageError(true);}},[state,design]);
 useEffect(()=>{const change=()=>setOnline(navigator.onLine);window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};},[]);
 useEffect(()=>{const back=()=>{setPanel(null);setQuery('');};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
 useEffect(()=>{if(panel){dialog.current?.showModal();}else{dialog.current?.close();returnFocus.current?.focus();}},[panel]);
 useEffect(()=>{const row=selectedRow.current;const list=row?.parentElement;if(design==='action'&&row&&list)list.scrollLeft=row.offsetLeft-list.offsetLeft-(list.clientWidth-row.clientWidth)/2;},[station.id,direction.id,design]);
 const open=(which:typeof panel)=>{returnFocus.current=document.activeElement as HTMLElement;history.pushState({designPanel:true},'');setPanel(which);};
 const close=()=>{setPanel(null);setQuery('');if(history.state?.designPanel)history.back();};
 const choose=(stationId:string,directionId?:string)=>{const s=catalog.find(s=>s.id===stationId)!;setState(p=>({...p,stationId,directionId:directionId??s.directions[0].id}));setSelectedTime(null);setShowPast(false);setNotice(`${s.name}に変更しました`);if(panel)close();};
 const favorite=()=>setState(p=>({...p,favorites:p.favorites.some(f=>f.stationId===station.id&&f.directionId===direction.id)?p.favorites.filter(f=>f.stationId!==station.id||f.directionId!==direction.id):[...p.favorites,{stationId:station.id,directionId:direction.id}]}));
 const changeScenario=(value:Scenario)=>{setScenario(value);setSelectedTime(null);setState(p=>({...p,walk:value==='denied'?null:p.walk}));};
 const favoriteButtons=<div className="review-favorite-list">{state.favorites.length?state.favorites.map(f=>{const s=catalog.find(s=>s.id===f.stationId)!;const d=s.directions.find(d=>d.id===f.directionId)!;return <button key={s.id+d.id} onClick={()=>choose(s.id,d.id)} aria-pressed={station.id===s.id&&direction.id===d.id}><span className="review-code">{s.code}</span><span><strong>{s.name}</strong><small>{d.name}</small></span><span aria-hidden="true">→</span></button>;}):<p>お気に入りはまだありません。駅を選び「この駅・方面を保存」を押してください。</p>}</div>;
 const stationControls=<section className="review-station" aria-label="駅と方面"><div className="review-station-top"><button className="review-station-change" onClick={()=>open('station')}><span>{station.operator} / {station.line}</span><strong>{station.name}<small>変更⌄</small></strong></button><button className="review-save" aria-label="この駅・方面を保存" aria-pressed={activeFavorite} onClick={e=>{if(e.detail<=1)favorite();}}>{activeFavorite?'★':'☆'}</button></div><div className="review-directions">{station.directions.map(d=><button key={d.id} onClick={()=>{setState(p=>({...p,directionId:d.id}));setSelectedTime(null);}} aria-pressed={direction.id===d.id}>{d.name}</button>)}</div></section>;
 const issue=model.issue&&model.issue in statusCopy?statusCopy[model.issue as keyof typeof statusCopy]:null;
 const status=issue&&<section className={'review-status review-status-'+model.issue} role="status"><strong>{issue[0]}</strong><p>{issue[1]}</p>{['failed','expired','missing'].includes(model.issue!)&&<button onClick={()=>{setNotice('比較用の状態を通常に戻しました。外部への再取得は行っていません。');changeScenario('normal');}}>もう一度読み込む（比較）</button>}{model.issue==='denied'&&<button onClick={()=>open('conditions')}>実測時間を入力</button>}<a href={station.sourceUrl} target="_blank" rel="noreferrer">公式の駅情報を開く ↗</a></section>;
 const decision=<section className="review-decision" aria-label="出発目安"><div className="review-decision-top"><span>{model.selected?'選んだ電車':'出発目安'}</span><span className="review-status-word">{model.result?.label??'計算できません'}</span></div>{model.selected?<><div className="review-train-heading"><strong>{model.selected.time}<small>発</small></strong><span>{model.selected.destination}行き<small>{model.selected.trainType??'種別未収録'} · {model.selected.platform?model.selected.platform+'番線':'番線未確認'}</small></span></div>{model.leaving?<div className="review-leave"><span>{model.leaving.remainingMs>=0?'ここを出る目安':'出発目安を過ぎています'}</span><strong>{clock(model.leaving.leaveAt)}<small>まで</small></strong><span>{model.leaving.remainingMs>=0?`あと${Math.floor(model.leaving.remainingMs/60000)}分`:'後の便を選んでください'}</span></div>:<p className="review-no-walk">{state.walk===null?'徒歩時間を入力すると、ここを出る目安がわかります。':'この時刻表では出発目安を計算できません。'}</p>}<button className="review-condition-button" onClick={()=>open('conditions')}>{state.walk===null?'実測時間を入力':`徒歩 ${state.walk}分 ＋ 構内・余裕 ${state.inside}分`}<span>計算条件 →</span></button><p className="review-note">予定時刻で計算。遅延・運休は未反映。</p></>:<p>時刻表の状態を確認してください。</p>}</section>;
 const rows=(showPast?model.trains:model.future);
 const trainList=<section className="review-trains" aria-label="電車を選ぶ"><div className="review-section-heading"><h2>{design==='board'?'発車案内':'ほかの便を選ぶ'}</h2><button onClick={()=>setShowPast(!showPast)} aria-pressed={showPast}>{showPast?'これからの便':'過去の便も見る'}</button></div>{design==='board'&&<div className="review-row-header"><span>発車</span><span>行先 / 種別</span><span>出発の余裕</span></div>}<div className="review-train-list">{rows.map((t,i)=>{const selected=t===model.selected;const past=t.epoch<=model.now;const result=judge(t.epoch,model.now,model.state==='ready'&&scenario!=='reference'&&state.walk!==null?{kind:'measured',minutes:state.walk}:{kind:'unavailable'},{stationMinutes:state.inside,speedKmh:4.8});return <button className={'review-train-row '+(selected?'selected':'')} ref={selected?selectedRow:undefined} key={t.time+t.destination+i} disabled={past} aria-pressed={selected} aria-label={`${t.time}発 ${t.destination}行き${selected?' 選択中':''}`} onClick={()=>{setSelectedTime(t.time);setNotice(`${t.time}発を選びました`);}}><strong>{t.time}</strong><span>{t.destination}<small>{t.trainType??'種別未収録'}</small></span><span className={'review-slack '+result.status}>{past?'発車済み':result.label}{!past&&result.slack!==null&&<small>{result.slack>=0?`出発まで${Math.floor(result.slack)}分`:'後の便へ'}</small>}</span>{selected&&<span className="review-selected-label">✓ 選択中</span>}</button>;})}</div>{!rows.length&&<p>表示できる便はありません。上の案内をご確認ください。</p>}<p className="review-note">{model.table?`${model.table.departures.length}便収録 · ${model.day}の運行日。24時以降も同じ運行日です。`:'この条件で表示できる時刻表がありません。'}</p></section>;
 return <div className={'design-review design-'+design}>
  <aside className="review-toolbar" aria-label="デザイン比較"><div><b>操作プレビュー</b><span>{scenario==='ended'?'10/27（火）03:59':'10/26（月）14:00'} · 徒歩{state.walk??'未設定'}分の比較例</span></div><nav>{Object.entries(variants).map(([id,v])=><a key={id} href={'/?design='+id} aria-current={id===design?'page':undefined}>{v.name}</a>)}<a href="/?design=baseline">現行</a></nav><details><summary>状態を試す・比較について</summary><label>表示状態<select value={scenario} onChange={e=>changeScenario(e.target.value as Scenario)}>{Object.entries(scenarioLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p>実データを固定日時で表示する比較専用画面です。状態切替は再現例で、通信・位置取得の実行ではありません。通常の設定・お気に入りは変更しません。選んだ方向を通常画面へ統合する前の試作です。</p><button onClick={()=>{setState(initial);setScenario('normal');setSelectedTime(null);setNotice('比較条件をリセットしました');}}>同じ比較条件に戻す</button><a href="/">通常画面へ</a></details></aside>
  <div className="review-app"><header className="review-header"><a href={'/?design='+design}>まにあう<span>次の電車と、歩く時間。</span></a><span className="review-current-time">{clock(model.now)}<small>比較用の指定時刻</small></span></header>
   <main>
    {design==='favorites'&&<section className="review-home-favorites"><div className="review-section-heading"><h1>いつもの駅</h1><button onClick={()=>open('station')}>駅を探す ＋</button></div>{favoriteButtons}</section>}
    {design==='board'&&<div className="review-intro"><h1>次の電車</h1><span>発車時刻から選ぶ</span></div>}
    {design==='action'&&<div className="review-intro"><h1>いつ出よう。</h1><span>歩いて向かう、その前に。</span></div>}
    {stationControls}{status}
    <div className="review-content">{design==='board'?<>{trainList}{decision}</>:<>{decision}{trainList}</>}</div>
    <details className="review-source"><summary>時刻表の出典・確認日</summary>{model.table?<><p><a href={model.table.sourceUrl} target="_blank" rel="noreferrer">時刻表の出典を開く ↗</a></p><p>取得 {model.table.retrievedAt} / 確認 {model.table.checkedAt}</p><p>改正 {model.table.revisionDate??'未確認'} / 適用 {model.table.validFrom??'未確認'} ～ {model.table.validTo??'終了日未公表'}</p><p>{model.state==='ready'?'出典照合済み':'判定には使えません'}。確認期限は適用終了日とは別です。臨時ダイヤ・当日の運行変更は網羅していません。</p>{station.id.startsWith('kobe-')&&<p>神戸市交通局「地下鉄オープンデータ」を加工（CC BY 2.1 JP）。</p>}</>:<p>この条件の出典情報はありません。</p>}</details>
    <p className="review-footer-note">乗車を保証するものではありません。<br/>信号待ちや混雑も見込んで、余裕を持ってお出かけください。</p>
    {storageError&&<p role="alert">比較用の設定を保存できません。再読込すると初期状態に戻ります。</p>}
   </main>
   <nav className="review-bottom" aria-label="よく使う操作"><button onClick={()=>open('favorites')}>☆ お気に入り</button><button onClick={()=>open('station')}>駅・方面</button><button onClick={()=>open('conditions')}>徒歩時間</button></nav>
  </div>
  <p className="review-sr" role="status">{notice}</p>
  <dialog className="review-dialog" ref={dialog} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}}} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="review-dialog-title"><div className="review-dialog-heading"><h2 id="review-dialog-title">{panel==='station'?'駅を選ぶ':panel==='conditions'?'出発目安の計算条件':'お気に入り'}</h2><button onClick={close} aria-label="閉じる">×</button></div>
   {panel==='station'&&<><label className="review-search">駅名・路線で検索<input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：学園都市、烏丸線"/></label><div className="review-search-results">{catalog.filter(s=>!s.timetablePath&&`${s.name} ${s.line} ${s.operator}`.includes(query)).map(s=><button key={s.id} onClick={()=>choose(s.id)}><strong>{s.name}</strong><small>{s.operator} / {s.line}</small></button>)}{!catalog.some(s=>!s.timetablePath&&`${s.name} ${s.line} ${s.operator}`.includes(query))&&<p>比較用の駅が見つかりません。駅名を短くするか、通常画面で検索してください。</p>}</div></>}
   {panel==='favorites'&&favoriteButtons}
   {panel==='conditions'&&<form onSubmit={e=>{e.preventDefault();close();}}><p>駅入口まで歩く時間と、入口から乗車するまでの時間を引いて計算します。この比較例では位置情報は取得しません。</p><label>駅入口までの実測時間（分）<input type="number" min="0" max="240" step="0.5" required value={state.walk??''} onChange={e=>{const n=e.target.valueAsNumber;if(e.target.value==='')setState(p=>({...p,walk:null}));else if(Number.isFinite(n)&&n>=0&&n<=240)setState(p=>({...p,walk:n}));}}/></label><label>構内移動と乗車までの余裕（分）<input type="number" min="0" max="60" required value={state.inside} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=0&&n<=60)setState(p=>({...p,inside:n}));}}/></label><p className="review-formula">{model.selected?`${model.selected.time} 発 − 徒歩 ${state.walk??'未設定'}分 − 構内・余裕 ${state.inside}分${model.leaving?' = '+clock(model.leaving.leaveAt):''}`:'電車を選ぶと計算式を表示します。'}</p><p>余裕は構内時間に含みます。別枠では加算しません。登録地点にいる場合の目安です。遅延・運休は反映しません。</p><button className="review-primary" type="submit">この条件で見る</button></form>}
  </dialog>
 </div>;
}

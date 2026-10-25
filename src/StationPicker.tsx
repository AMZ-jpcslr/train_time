import {useEffect,useId,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import type {Station} from './domain/types';
import {searchStations} from './domain/stationSearch';
import './station-search.css';

export default function StationPicker({stations,station,onChange,favorites,onFavorite,onWesternSearch,westernLoading=false,westernMessage='',westernError=''}:{
 stations:Station[];station:Station;onChange:(id:string)=>void;favorites:string[];onFavorite:(id:string)=>void;
 onWesternSearch?:(query:string)=>void;westernLoading?:boolean;westernMessage?:string;westernError?:string;
}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null);
 const list=useRef<HTMLDivElement>(null),id=useId();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[limit,setLimit]=useState(40);
 const [anchor,setAnchor]=useState({left:0,top:0});
 const searching=Boolean(query.trim());
 const matches=useMemo(()=>searching?searchStations(stations,query):stations.filter(s=>s.id===station.id||favorites.includes(s.id)),[stations,query,searching,favorites,station.id]);
 const results=matches.slice(0,limit);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 const show=()=>{
  const rect=trigger.current!.getBoundingClientRect();
  setAnchor({left:Math.max(16,Math.min(rect.left,window.innerWidth-456)),top:Math.max(16,Math.min(rect.bottom+10,window.innerHeight-540))});
  setQuery('');setLimit(40);setOpen(true);dialog.current?.showModal();
 };
 const close=()=>{dialog.current?.close();setOpen(false);};
 const focusResult=(index:number)=>list.current?.querySelectorAll<HTMLButtonElement>('button[data-station-id]')[index]?.focus();
 const move=(event:KeyboardEvent,index:number)=>{
  let next=index;
  if(event.key==='ArrowDown')next=(index+1)%results.length;
  else if(event.key==='ArrowUp')next=(index-1+results.length)%results.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=results.length-1;
  else return;
  event.preventDefault();focusResult(next);
 };
 return <div className="station-picker">
  <button ref={trigger} className="station-trigger" aria-label="乗車駅" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show}>
   <span><small>駅を検索・選択</small><strong>{station.name}</strong></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <dialog id={id} ref={dialog} className="station-dialog" aria-labelledby={`${id}-title`} onClose={()=>{setOpen(false);trigger.current?.focus();}} onCancel={()=>setOpen(false)}
   onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input')).filter(el=>el.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&event.target===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&event.target===last){event.preventDefault();first?.focus();}
   }}
   style={{'--picker-left':`${anchor.left}px`,'--picker-top':`${anchor.top}px`} as CSSProperties} onClick={event=>{
    if(event.target!==event.currentTarget)return;
    const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
   }}>
   <div className="station-dialog-header"><div><span className="eyebrow">FIND YOUR STATION</span><h2 id={`${id}-title`}>乗車駅を選ぶ</h2></div><button className="station-close" aria-label="駅選択を閉じる" onClick={close}>×</button></div>
   <label className="station-search"><span>駅名・路線で検索</span><input ref={input} type="search" value={query} placeholder="駅名・路線・事業者・地域" autoComplete="off" onChange={event=>{setQuery(event.target.value);setLimit(40);}} onKeyDown={event=>{if(event.key==='ArrowDown'&&results.length){event.preventDefault();focusResult(0);}}}/></label>
   <p className="station-result-count" role="status">{searching?`${matches.length}件が見つかりました`:'選択中・お気に入りの駅'}<span>{stations.length}駅・路線から検索</span></p>
   <div className="station-options" ref={list}>
    {onWesternSearch&&<div className="western-search"><button type="button" disabled={!searching||westernLoading} onClick={()=>onWesternSearch(query)}>{westernLoading?'西日本の駅を検索中…':'JR西日本・阪急・阪神の駅も検索'}</button><p className="small-note">駅名を入力して追加検索できます。「阪急 十三」など事業者名でも絞り込めます。追加時刻表は非公式APIの参考情報です。</p>{westernMessage&&<p role="status">{westernMessage}</p>}{westernError&&<p role="alert">{westernError}</p>}</div>}
    {!searching&&<p className="station-search-hint">駅名などを入力して検索。☆で駅を変更せずに登録できます。</p>}
    <ul className="station-search-results" aria-label="駅の検索結果">
     {results.map((s,index)=><li key={s.id} className="station-search-row">
      <button type="button" data-station-id={s.id} aria-label={`${s.name}（${s.operator}・${s.line}）を選択`} aria-current={s.id===station.id?'true':undefined} className="station-option" onKeyDown={event=>move(event,index)} onClick={()=>{onChange(s.id);close();}}>
       <span className="option-code" aria-hidden="true">{s.code}</span><span className="option-text"><strong>{s.name}</strong><small>{s.operator} · {s.line}</small>{s.region&&<small>{s.region}</small>}</span>
      </button>
      <button type="button" className="station-result-favorite" aria-label={`${s.name}（${s.line}）をお気に入り${favorites.includes(s.id)?'から解除':'に登録'}`} aria-pressed={favorites.includes(s.id)} onClick={()=>onFavorite(s.id)}>{favorites.includes(s.id)?'★':'☆'}</button>
     </li>)}
    </ul>
    {searching&&matches.length===0&&<p className="station-no-results">一致する駅がありません。駅名や路線名を変えて検索してください。未対応の事業者は「対応路線とデータ」で確認できます。</p>}
    {matches.length>limit&&<button className="station-more" onClick={()=>setLimit(n=>n+40)}>さらに40件を表示（{limit} / {matches.length}件）</button>}
   </div>
   <p className="station-dialog-footnote">同じ駅名でも事業者・路線ごとに表示。☆はこの端末に保存します。</p>
  </dialog>
 </div>;
}

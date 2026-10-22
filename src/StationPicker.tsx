import {useEffect,useId,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import type {Station} from './domain/types';

const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g,'');

/** A modal station chooser: native focus containment, custom visual controls. */
export default function StationPicker({stations,station,onChange}:{stations:Station[];station:Station;onChange:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const list=useRef<HTMLDivElement>(null);
 const closeButton=useRef<HTMLButtonElement>(null);
 const id=useId();
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [active,setActive]=useState(0);
 const [anchor,setAnchor]=useState({left:0,top:0});
 const filtered=stations.filter(s=>normalize(s.name+s.operator+s.line+s.code).includes(normalize(query)));
 const activeStation=filtered[active];
 useEffect(()=>{if(open)list.current?.focus();},[open]);
 useEffect(()=>{if(open&&activeStation)document.getElementById(`${id}-${activeStation.id}`)?.scrollIntoView({block:'nearest'});},[open,activeStation,id]);
 const show=()=>{
  const rect=trigger.current!.getBoundingClientRect();
  setAnchor({left:Math.max(16,Math.min(rect.left,window.innerWidth-456)),top:Math.max(16,Math.min(rect.bottom+10,window.innerHeight-420))});
  setQuery('');setActive(stations.findIndex(s=>s.id===station.id));setOpen(true);dialog.current?.showModal();
 };
 const close=()=>{dialog.current?.close();setOpen(false);};
 const select=(next:Station)=>{onChange(next.id);close();};
 const move=(event:KeyboardEvent)=>{
  if(!filtered.length)return;
  let index=active;
  if(event.key==='ArrowDown')index=(active+1)%filtered.length;
  else if(event.key==='ArrowUp')index=(active-1+filtered.length)%filtered.length;
  else if(event.key==='Home')index=0;
  else if(event.key==='End')index=filtered.length-1;
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(activeStation)select(activeStation);return;}
  else return;
  event.preventDefault();setActive(index);
 };
 return <div className="station-picker">
  <button ref={trigger} className="station-trigger" aria-label="乗車駅" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show}>
   <span><small>乗車駅を選択</small><strong>{station.name}</strong></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <dialog id={id} ref={dialog} className="station-dialog" aria-labelledby={`${id}-title`} onClose={()=>setOpen(false)} onCancel={()=>setOpen(false)} onKeyDown={event=>{
   if(event.key!=='Tab')return;
   if(!event.shiftKey&&event.target===list.current){event.preventDefault();closeButton.current?.focus();}
   if(event.shiftKey&&event.target===closeButton.current){event.preventDefault();list.current?.focus();}
  }} style={{'--picker-left':`${anchor.left}px`,'--picker-top':`${anchor.top}px`} as CSSProperties} onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  }}>
   <div className="station-dialog-header"><div><span className="eyebrow">SELECT YOUR STATION</span><h2 id={`${id}-title`}>乗車駅を選ぶ</h2></div><button ref={closeButton} className="station-close" aria-label="駅選択を閉じる" onClick={close}>×</button></div>
   <label className="station-search"><span>駅名・路線で検索</span><input type="search" value={query} placeholder="茨木、神戸線、阪急…" autoComplete="off" onChange={event=>{setQuery(event.target.value);setActive(0);}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();list.current?.focus();}}}/></label>
   <p className="station-result-count" role="status">{filtered.length}駅{query?'が見つかりました':'から選択'}<span>事業者・路線を確認して選べます</span></p>
   <div className="station-options" role="listbox" aria-label="対象駅" ref={list} tabIndex={0} aria-activedescendant={activeStation?`${id}-${activeStation.id}`:undefined} onKeyDown={move}>
    {filtered.map((s,index)=><button type="button" role="option" tabIndex={-1} id={`${id}-${s.id}`} data-station-id={s.id} aria-selected={s.id===station.id} key={s.id} className={`station-option ${active===index?'is-focused':''}`} onFocus={()=>setActive(index)} onClick={()=>select(s)}>
     <span className="option-code" aria-hidden="true">{s.code}</span><span className="option-text"><strong>{s.name}</strong><small>{s.operator} · {s.line}</small></span><span className="option-check" aria-hidden="true">{s.id===station.id?'✓':'↗'}</span>
    </button>)}
    {filtered.length===0&&<p className="station-no-results">一致する駅がありません。駅名や路線名を変えて検索してください。</p>}
   </div>
   <p className="station-dialog-footnote">現在地の近くの駅は「駅までの道のり」に表示します。</p>
  </dialog>
 </div>;
}

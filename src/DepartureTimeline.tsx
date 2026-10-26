import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {flushSync} from 'react-dom';
import {judge,leavingWindow,type Walking} from './domain/journey';
import {formatClock} from './domain/time';
import {reachableTrains,timelineCursor} from './domain/timeline';
import type {Settings,Station} from './domain/types';
import {departureKey,departureRank,type ScheduledDeparture} from './useTrainSelection';
import {neighboringStations} from './data/neighbors';
import StayTime from './StayTime';
import TrainTypeBadge from './TrainTypeBadge';
import {trainTypeColor} from './domain/trainType';


type Props={trains:ScheduledDeparture[];selected?:ScheduledDeparture;now:number;walk:Walking;settings:Settings;station:Station;directionId:string;day:string;placeName?:string;preview:boolean;onSelect:(train:ScheduledDeparture)=>void;compact?:boolean};
export default function DepartureTimeline({trains,selected,now,walk,settings,station,directionId,day,placeName,preview,onSelect,compact=false}:Props){
 // Development-only comparison; the evaluated production layout is horizontal.
 const vertical=import.meta.env.DEV&&new URLSearchParams(location.search).get('timeline')==='vertical';
 const strip=useRef<HTMLDivElement>(null);
 const frame=useRef<number|null>(null);
 const animateUntil=useRef(0);
 const previousContext=useRef('');
 const [fractional,setFractional]=useState(0);
 const committedFractional=useRef(0);
 const pendingJump=useRef<{card:HTMLElement;vertical:boolean}|null>(null);
 const jumpFrame=useRef<number|null>(null);
 const [railOpen,setRailOpen]=useState(!compact);
 const cursor=timelineCursor(trains,fractional)??now;
 const viewIndex=Math.max(0,Math.min(trains.length-1,Math.round(fractional)));
 const selectedKey=selected?departureKey(selected):'';
 const reachable=useMemo(()=>reachableTrains(trains,now,walk,settings),[trains,now,walk,settings]);
 const comfortable=useMemo(()=>trains.find(train=>train.epoch>now&&judge(train.epoch,now,walk,settings).status==='comfortable'),[trains,now,walk,settings]);
 const future=useMemo(()=>trains.filter(train=>train.epoch>now),[trains,now]);
 const futureRanks=useMemo(()=>new Map(future.map((train,index)=>[train,index])),[future]);
 const next=selected?future[future.findIndex(train=>departureKey(train)===selectedKey)+1]:undefined;
 const neighbors=neighboringStations(station.id,directionId);
 const cancelJump=()=>{
  pendingJump.current=null;
  if(jumpFrame.current!==null)cancelAnimationFrame(jumpFrame.current);
  jumpFrame.current=null;
 };
 const jump=(index:number,animate=true)=>{
  cancelJump();
  const element=strip.current?.children[Math.max(0,index)] as HTMLElement|undefined;
  if(element&&strip.current){
   const smooth=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(!smooth)pendingJump.current={card:element,vertical};
   strip.current.scrollTo(vertical?{top:element.offsetTop-4,behavior:smooth?'smooth':'instant'}:{left:element.offsetLeft-2,behavior:smooth?'smooth':'instant'});
   // During animation the diagram follows the actual scroll position, not its destination.
   if(!smooth){animateUntil.current=0;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;committedFractional.current=index;setFractional(index);}
   else {animateUntil.current=performance.now()+2000;onScroll();}
  }
 };
 const finishJump=()=>{
  if(!pendingJump.current||jumpFrame.current!==null)return;
  // A compositor snap can write once more in the frame after scrollend.
  // Cross that rendering boundary before reconciling, instead of fighting it
  // inside the event. A new gesture/context cancels both pending frames.
  jumpFrame.current=requestAnimationFrame(()=>{
   jumpFrame.current=requestAnimationFrame(()=>{
    jumpFrame.current=null;
    const pending=pendingJump.current;
    pendingJump.current=null;
    const element=strip.current;
    if(!pending||!element||pending.card.parentElement!==element)return;
    const target=pending.vertical?pending.card.offsetTop-4:pending.card.offsetLeft-2;
    const maximum=pending.vertical?element.scrollHeight-element.clientHeight:element.scrollWidth-element.clientWidth;
    const bounded=Math.max(0,Math.min(maximum,target));
    const actual=pending.vertical?element.scrollTop:element.scrollLeft;
    if(Math.abs(actual-bounded)>1)element.scrollTo(pending.vertical?{top:bounded,behavior:'instant'}:{left:bounded,behavior:'instant'});
   });
  });
 };
 useEffect(()=>{
  const context=`${station.id}/${directionId}/${day}`;
  jump(selectedKey?Math.max(0,trains.findIndex(train=>departureKey(train)===selectedKey)):trains.length-1,!compact&&previousContext.current===context);
  previousContext.current=context;
 },[selectedKey,station.id,directionId,day]);
 useEffect(()=>()=>{cancelJump();if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;},[]);
 useEffect(()=>{if(railOpen)onScroll();},[railOpen]);
 const onScroll=()=>{
  if(frame.current!==null)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   const element=strip.current,first=element?.children[0] as HTMLElement|undefined;
   if(!element||!first)return;
   const cards=Array.from(element.children) as HTMLElement[];
   const position=vertical?element.scrollTop:element.scrollLeft;
   const offset=(card:HTMLElement)=>vertical?card.offsetTop-first.offsetTop:card.offsetLeft-first.offsetLeft;
   let base=0;
   for(let i=1;i<cards.length&&offset(cards[i])<=position;i++)base=i;
   const pitch=cards[base+1]?offset(cards[base+1])-offset(cards[base]):1;
   const index=base+(cards[base+1]?(position-offset(cards[base]))/pitch:0);
   const bounded=Math.max(0,Math.min(trains.length-1,index));
   // A closed diagram needs only the card index for keyboard/footer controls.
   // Avoid synchronously re-rendering the timeline on every pixel of scrolling.
   const nextFractional=railOpen?bounded:Math.round(bounded);
   if(nextFractional!==committedFractional.current){
    committedFractional.current=nextFractional;
    // Keep the visible diagram synchronized with native WebKit scrolling.
    if(railOpen)flushSync(()=>setFractional(nextFractional));
    else setFractional(nextFractional);
   }
   // WebKit can coalesce scroll events during native smooth scrolling.
   // Sample every frame while a button-initiated animation may still be moving.
   if(railOpen&&performance.now()<animateUntil.current)onScroll();
  });
 };
 const iconStart=Math.max(0,viewIndex-2);
 const iconTrains=trains.slice(iconStart,viewIndex+3).map((train,index)=>({train,index:index+iconStart}));
 const cards=useMemo(()=>trains.map(train=>{
    const past=train.epoch<=now,active=selectedKey===departureKey(train),rank=futureRanks.get(train)??-1;
    const judgment=judge(train.epoch,now,walk,settings),stay=leavingWindow(train.epoch,now,walk,settings);
    return <article key={departureKey(train)} className={`departure-card ${active?'is-selected':''} ${past?'is-past':''}`} data-epoch={train.epoch}>
     <div className="card-kicker"><span>{past?'発車時刻を過ぎた便':departureRank(rank)}</span><b>{active?'選択中':Number(train.time.slice(0,2))>=24?'翌日':''}</b></div>
     <p className={active&&!compact?'decision-train':'card-train'}><strong>{train.time} 発</strong><TrainTypeBadge stationId={station.id} type={train.trainType}/></p>
     <p className="card-destination">{train.destination}行き <small>{train.platform?`${train.platform}番線`:'番線未確認'}{train.trainNumber?` · 列車番号 ${train.trainNumber}`:''}</small></p>
     {active&&!compact?<StayTime departure={train.epoch} now={now} walk={walk} settings={settings} placeName={placeName} preview={preview}/>:<div className="card-stay"><span>{placeName?`登録地点「${placeName}」`:'ここ'}を出る目安</span><strong>{past?'乗車対象にできません':!stay?'計算できません':stay.remainingMs<0?'出発目安を過ぎています':stay.remainingMs===0?'出発の目安は今です':`あと ${Math.floor(stay.seconds/60)}分`}</strong>{!past&&stay&&<p>{formatClock(stay.leaveAt).slice(0,5)} までに出発する目安</p>}</div>}
     <p className={active&&!compact?'decision-countdown':'card-countdown'}>{past?'発車済み（定刻）':`電車の発車まで ${Math.max(0,Math.ceil((train.epoch-now)/60000))}分`}</p>
     <div className={`${active&&!compact?'judgment':'card-judgment'} ${past?'unknown':judgment.status}`}><strong>{past?'過去の時刻表':judgment.label}</strong></div>
     <button className={past?'past-choice':'train-choice'} disabled={past} aria-pressed={past?undefined:active} aria-label={`${past?'過去の便':departureRank(rank)} ${train.time}発 ${train.destination}行き${train.trainNumber?` 列車番号${train.trainNumber}`:''}を選ぶ`} onClick={()=>onSelect(train)}>{past?'発車済み':active?'選択中':'この電車を選ぶ'}<time className="sr-only">{train.time}</time><span className="choice-stay sr-only">{!stay?'計算できません':`${Math.floor(stay.seconds/60)}分`}</span></button>
    </article>;
   }),[trains,station.id,selectedKey,now,walk.kind,'minutes' in walk?walk.minutes:null,settings.stationMinutes,placeName,preview,onSelect,compact]);
 const rail=<>
  <div className="rail-caption"><span>時刻表の流れ <b>{formatClock(cursor).slice(0,5)}</b></span><span>閲覧時刻 · JST</span></div>
  <div className="rail-scene" aria-label={`${station.name}の線路概略図。時刻表のイメージで、列車の実位置ではありません。`} role="img">
   <div className="rail-stations"><span>{neighbors.before}</span><strong>{station.name.replace(/^(JR|阪急|阪神)/,'')}<small>選んだ駅</small></strong><span>{neighbors.after}</span></div>
   <div className="rail-track" aria-hidden="true"><i/><i/><i/>
    {iconTrains.map(({train,index})=><span className="rail-train" key={departureKey(train)} data-epoch={train.epoch} style={{transform:`translate${vertical?'Y':'X'}(${(index-fractional)*96}px)`,'--type-color':trainTypeColor(station.id,train.trainType)??'#727D78'} as CSSProperties}><svg viewBox="0 0 32 22"><rect x="2" y="2" width="28" height="15" rx="3"/><path d="M8 17v3m16-3v3M6 6h7v6H6zm13 0h7v6h-7z"/></svg><small>{train.time}</small></span>)}
   </div>
  </div>
  <p className="rail-disclaimer">時刻表の相対表示・実位置ではありません</p>
 </>;
 return <div className={`departure-timeline${vertical?' is-vertical':''}`}>
  {compact?<details className="rail-disclosure" onToggle={event=>setRailOpen(event.currentTarget.open)}><summary>時刻表の流れを見る</summary>{rail}</details>:rail}
  <div className="timeline-help" role="group" aria-label="列車の移動と選択">
   <button className="timeline-next" aria-label="一本後を選ぶ" disabled={!next} onClick={()=>{if(next)onSelect(next);}}>一本後へ</button>
   <button onClick={()=>jump(Math.max(0,trains.findIndex(train=>train.epoch>now)))}>現在付近へ</button>
   <button aria-label="出発に余裕のある便へ" disabled={!comfortable} onClick={()=>{if(comfortable){jump(trains.indexOf(comfortable),false);onSelect(comfortable);}}}>余裕のある便へ</button>
  </div>
  <div className="timeline-strip" ref={strip} onScroll={onScroll} onScrollEnd={finishJump} onPointerDown={cancelJump} onTouchStart={cancelJump} onWheel={cancelJump} role="group" aria-label="時系列の列車カード" tabIndex={0} onKeyDown={event=>{
   cancelJump();
   if(event.target!==event.currentTarget)return;
   if(event.key==='ArrowRight'||(vertical&&event.key==='ArrowDown')){event.preventDefault();jump(Math.min(trains.length-1,viewIndex+1));}
   if(event.key==='ArrowLeft'||(vertical&&event.key==='ArrowUp')){event.preventDefault();jump(Math.max(0,viewIndex-1));}
   if(event.key==='Home'){event.preventDefault();jump(0);}
   if(event.key==='End'){event.preventDefault();jump(trains.length-1);}
  }}>
   {cards}
  </div>
  <div className="timeline-toolbar"><span>{day} 運行日 · {trains.length}本</span><span>{vertical?'↑ 過去 ／ 後の便 ↓':'← 過去 ／ 後の便 →'}</span></div>
  <div className="timeline-footer"><button onClick={()=>jump(Math.max(0,viewIndex-1))} disabled={viewIndex===0}>← 前の便</button><span>{viewIndex+1} / {trains.length}</span><button onClick={()=>jump(Math.min(trains.length-1,viewIndex+1))} disabled={viewIndex===trains.length-1}>後の便 →</button></div>
  <p className="timeline-availability">{walk.kind==='unavailable'||walk.kind==='failed'||walk.kind==='estimate'?'徒歩時間が未確認のため、出発の余裕は判定できません。':reachable.length>=3?`出発目安がまだ過ぎていない便は${reachable.length}本。後の便まで比較できます。`:`この運行日に出発目安がまだ過ぎていない便は${reachable.length}本です。${future.length?'終電までの取得済み時刻表を表示しています。':'この運行日の発車は終了しました。'}`}</p>
  <p className="timeline-note">隣駅は路線上の駅で、列車の停車駅とは限りません。スクロールは閲覧時刻だけを変更し、出発の余裕は画面の現在時刻から計算します。</p>
 </div>;
}

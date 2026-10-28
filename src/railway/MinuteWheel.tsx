import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
const HEIGHT=56,MAX=240;
const clamp=(value:number)=>Math.max(0,Math.min(MAX,value));
/** Walking duration only. No departure clock or geolocation state is changed here. */
export default function MinuteWheel({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const parsed=Number(value),valid=value.trim()!==''&&Number.isFinite(parsed)&&parsed>=0&&parsed<=MAX&&parsed*2===Math.round(parsed*2);
 const minutes=Math.floor(clamp(Number.isFinite(parsed)?parsed:0)),half=valid&&parsed%1!==0;
 const id=useId(),ref=useRef<HTMLDivElement>(null),latest=useRef({minutes,half,onChange});latest.current={minutes,half,onChange};
 const drag=useRef<{id:number;y:number;value:number}|null>(null),wheelDelta=useRef(0),[dragging,setDragging]=useState(false);
 const commit=(next:number)=>{const state=latest.current;state.onChange(String(clamp(Math.round(next)+(state.half ? .5 : 0))));};
 useEffect(()=>{
  const element=ref.current;if(!element)return;
  const wheel=(event:WheelEvent)=>{
   if(document.activeElement!==element)return; // Else the containing page scrolls normally.
   const direction=Math.sign(event.deltaY),current=latest.current.minutes;
   if((direction<0&&current===0)||(direction>0&&current===MAX))return;
   event.preventDefault();wheelDelta.current+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?HEIGHT*3:1);
   if(Math.abs(wheelDelta.current)<40)return;
   const step=Math.sign(wheelDelta.current);wheelDelta.current=0;commit(latest.current.minutes+step);
  };
  element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[]);
 const keys=(event:KeyboardEvent)=>{
  const next=event.key==='ArrowUp'?minutes+1:event.key==='ArrowDown'?minutes-1:event.key==='PageUp'?minutes+10:event.key==='PageDown'?minutes-10:event.key==='Home'?0:event.key==='End'?MAX:null;
  if(next===null)return;event.preventDefault();commit(next);
 };
 return <div className="minute-picker">
  <p id={`${id}-label`} className="minute-picker-label">駅入口までの徒歩時間</p>
  <div className="minute-wheel-controls"><button type="button" aria-label="徒歩を1分増やす" disabled={minutes>=MAX} onClick={()=>commit(minutes+1)}>＋</button>
   <div ref={ref} className={`minute-wheel ${dragging?'is-dragging':''}`} role="spinbutton" tabIndex={0} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} aria-valuemin={0} aria-valuemax={MAX} aria-valuenow={minutes} aria-valuetext={`${minutes}分${half?'30秒':''}`} onKeyDown={keys} onBlur={()=>{wheelDelta.current=0;}} onPointerDown={event=>{
    if(!event.isPrimary||event.button!==0)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,y:event.clientY,value:minutes};setDragging(true);
   }} onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;const next=clamp(start.value+Math.round((start.y-event.clientY)/HEIGHT));if(next!==latest.current.minutes)commit(next);}} onPointerUp={()=>{drag.current=null;setDragging(false);}} onPointerCancel={()=>{drag.current=null;setDragging(false);}} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}>
    <div className="minute-wheel-window" aria-hidden="true"/>
    <div className="minute-wheel-numbers" aria-hidden="true" style={{transform:`translateY(${HEIGHT-minutes*HEIGHT}px)`}}>{Array.from({length:MAX+1},(_,number)=><div key={number} className={number===minutes?'is-selected':''}>{String(number).padStart(3,'0')}</div>)}</div>
    <span className="minute-wheel-unit" aria-hidden="true">分</span>
   </div>
   <button type="button" aria-label="徒歩を1分減らす" disabled={minutes===0} onClick={()=>commit(minutes-1)}>−</button>
  </div>
  <p id={`${id}-hint`} className="minute-wheel-hint">上下に動かして選択。矢印キーでも変えられます。</p>
  <div className="minute-picker-options"><label className="minute-half"><input type="checkbox" checked={half} disabled={minutes===MAX} onChange={event=>onChange(String(minutes+(event.target.checked ? .5 : 0)))}/>30秒を加える</label><label className="minute-direct">直接入力<input type="number" aria-label="駅入口までの徒歩時間（分）" min="0" max={MAX} step="0.5" required inputMode="decimal" value={value} aria-invalid={!valid||undefined} onChange={event=>onChange(event.target.value)}/><span>分</span></label></div>
  {!valid&&<p className="minute-error" role="alert">0〜240分で、30秒単位の数字を入力してください。</p>}
 </div>;
}

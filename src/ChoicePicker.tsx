import {useEffect,useId,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import './mobile-controls.css';
import {useDialogHistory} from './useDialogHistory';

type Choice = {id:string;label:string;description?:string};
type Props = {label:string;value:string;options:Choice[];onChange:(id:string)=>void;disabled?:boolean;emptyText?:string};

/** A compact selector that shares the station board's desktop panel / mobile sheet. */
export default function ChoicePicker({label,value,options,onChange,disabled=false,emptyText='選択してください'}:Props){
 const id=useId();
 const trigger=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const list=useRef<HTMLDivElement>(null);
 const closeButton=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false);
 const modal=useDialogHistory(dialog,()=>setOpen(false));
 const typed=useRef({text:'',at:0});
 const [active,setActive]=useState(0);
 const [anchor,setAnchor]=useState({left:16,top:16});
 const selected=options.find(option=>option.id===value);
 const activeIndex=Math.min(active,Math.max(0,options.length-1));
 const position=()=>{
  const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
  setAnchor({left:Math.max(16,Math.min(rect.left,window.innerWidth-376)),top:Math.max(16,Math.min(rect.bottom+8,window.innerHeight-330))});
 };
 useEffect(()=>{if(open){list.current?.focus();window.addEventListener('resize',position);}return()=>window.removeEventListener('resize',position);},[open]);
 useEffect(()=>{if(open)document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({block:'nearest'});},[open,id,activeIndex]);
 const show=()=>{position();setActive(Math.max(0,options.findIndex(option=>option.id===value)));if(modal.show())setOpen(true);};
 const close=modal.close;
 const select=(option:Choice)=>{onChange(option.id);close();};
 const move=(event:KeyboardEvent)=>{
  if(!options.length)return;
  if(event.key==='ArrowDown')setActive((activeIndex+1)%options.length);
  else if(event.key==='ArrowUp')setActive((activeIndex-1+options.length)%options.length);
  else if(event.key==='Home')setActive(0);
  else if(event.key==='End')setActive(options.length-1);
  else if(event.key==='Enter'||event.key===' ')select(options[activeIndex]);
  else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const now=Date.now();typed.current={text:(now-typed.current.at<700?typed.current.text:'')+event.key,at:now};
   const query=typed.current.text.normalize('NFKC').toLocaleLowerCase('ja');
   const index=options.findIndex(option=>option.label.normalize('NFKC').toLocaleLowerCase('ja').startsWith(query));
   if(index>=0)setActive(index);
  }else return;
  event.preventDefault();
 };
 return <div className="choice-picker">
  <span className="choice-label">{label}</span>
  <button type="button" ref={trigger} className="choice-trigger" disabled={disabled||!options.length} aria-label={label} aria-describedby={`${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}}}>
   <span id={`${id}-value`}>{selected?.label??emptyText}</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <dialog ref={dialog} id={id} className="choice-dialog" aria-labelledby={`${id}-title`} style={{'--choice-left':`${anchor.left}px`,'--choice-top':`${anchor.top}px`} as CSSProperties} onClose={event=>{event.stopPropagation();setOpen(false);}} onCancel={event=>{event.stopPropagation();event.preventDefault();close();}} onKeyDown={event=>{
   event.stopPropagation();
   if(event.key!=='Tab')return;
   event.preventDefault();if(document.activeElement===closeButton.current)list.current?.focus();else closeButton.current?.focus();
  }} onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  }}>
   <div className="choice-dialog-header"><div><h2 id={`${id}-title`}>{label}を選ぶ</h2></div><button type="button" className="choice-close" ref={closeButton} aria-label={`${label}の選択を閉じる`} onClick={close}>×</button></div>
   <div ref={list} className="choice-options" role="listbox" aria-label={label} tabIndex={0} aria-activedescendant={options.length?`${id}-option-${activeIndex}`:undefined} onKeyDown={move}>
    {options.map((option,index)=><button type="button" role="option" id={`${id}-option-${index}`} key={option.id} tabIndex={-1} data-value={option.id} aria-selected={option.id===value} className={`choice-option ${index===activeIndex?'is-focused':''}`} onFocus={()=>setActive(index)} onClick={()=>select(option)}>
     <span><strong>{option.label}</strong>{option.description&&<small>{option.description}</small>}</span><span className="choice-check" aria-hidden="true">{option.id===value?'✓':'→'}</span>
    </button>)}
    {!options.length&&<p className="choice-empty">{emptyText}</p>}
   </div>
  </dialog>
 </div>;
}

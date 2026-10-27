import {useCallback,useEffect,useId,useRef,type RefObject} from 'react';
/** Each modal owns one history entry; browser Back closes only that modal. */
export function useDialogHistory(dialog:RefObject<HTMLDialogElement|null>,onClosed:()=>void){
 const id=useId(),trigger=useRef<HTMLElement|null>(null),pending=useRef(false),closed=useRef(onClosed);closed.current=onClosed;
 const finish=useCallback(()=>{dialog.current?.close();closed.current();requestAnimationFrame(()=>{
  if(dialog.current?.open)return;
  const target=trigger.current?.isConnected&&trigger.current.getClientRects().length?trigger.current:document.querySelector<HTMLElement>('.decision-heading h1');
  target?.focus({preventScroll:true});
 });},[dialog]);
 useEffect(()=>{const pop=()=>{pending.current=false;if(dialog.current?.open&&history.state?.maniaDialog!==id)finish();};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[finish,id,dialog]);
 const show=()=>{if(pending.current||dialog.current?.open)return false;trigger.current=document.activeElement as HTMLElement;history.pushState({...history.state,maniaDialog:id},'');dialog.current?.showModal();return true;};
 const close=()=>{finish();if(history.state?.maniaDialog===id){pending.current=true;history.back();}};
 return {show,close};
}

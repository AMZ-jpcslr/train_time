import {useCallback,useEffect,useId,useRef,type RefObject} from 'react';

// A history traversal belongs to the page, not just the dialog that requested it.
// Opening another modal before Back completes would otherwise close the new one.
const closing=new Set<string>();
const queued=new Map<string,()=>void>();
let openingFrame=0;
function openAfterTraversal(){
 if(closing.size||!queued.size||openingFrame)return;
 openingFrame=requestAnimationFrame(()=>{
  openingFrame=0;if(closing.size)return;
  const latest=[...queued.values()].at(-1);queued.clear();latest?.();
 });
}

/** Each modal owns one history entry; browser Back closes only that modal. */
export function useDialogHistory(dialog:RefObject<HTMLDialogElement|null>,onClosed:()=>void){
 const id=useId(),trigger=useRef<HTMLElement|null>(null),pending=useRef(false),closed=useRef(onClosed);closed.current=onClosed;
 const finish=useCallback(()=>{
  dialog.current?.close();closed.current();requestAnimationFrame(()=>{
   if(document.querySelector('dialog[open]'))return;
   const target=trigger.current?.isConnected&&trigger.current.getClientRects().length?trigger.current:document.querySelector<HTMLElement>('.decision-heading h1');
   target?.focus({preventScroll:true});
  });
 },[dialog]);
 useEffect(()=>{
  const pop=()=>{
   if(pending.current){pending.current=false;closing.delete(id);}
   if(dialog.current?.open&&history.state?.maniaDialog!==id)finish();
   openAfterTraversal();
  };
  window.addEventListener('popstate',pop);
  return()=>{
   window.removeEventListener('popstate',pop);queued.delete(id);
   if(pending.current)window.addEventListener('popstate',()=>{closing.delete(id);openAfterTraversal();},{once:true});
  };
 },[finish,id,dialog]);
 const show=(onShown?:()=>void)=>{
  if(dialog.current?.open)return false;
  trigger.current=document.activeElement as HTMLElement;
  const display=()=>{
   if(!dialog.current||dialog.current.open)return;
   if(closing.size){queued.set(id,display);return;}
   history.pushState({...history.state,maniaDialog:id},'');dialog.current.showModal();onShown?.();
  };
  if(closing.size){queued.set(id,display);return false;}
  display();return true;
 };
 const cancelShow=()=>{queued.delete(id);};
 const close=()=>{
  cancelShow();if(!dialog.current?.open)return;
  finish();if(!pending.current&&history.state?.maniaDialog===id){pending.current=true;closing.add(id);history.back();}
 };
 return {show,close,cancelShow};
}

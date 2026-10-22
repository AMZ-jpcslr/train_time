import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {applyPwaUpdate,checkPwaUpdate,getPwaUpdate,subscribePwaUpdate} from './serviceWorkerUpdates';
import './pwa-update.css';
export default function PwaUpdate(){
 const state=useSyncExternalStore(subscribePwaUpdate,getPwaUpdate,getPwaUpdate);
 const sectionRef=useRef<HTMLElement>(null);
 const [noticeDismissed,setNoticeDismissed]=useState(false);
 const ready=state.phase==='available',busy=state.phase==='checking'||state.phase==='applying';
 useEffect(()=>{if(!ready)setNoticeDismissed(false);},[ready]);
 if(!import.meta.env.PROD||!('serviceWorker' in navigator))return null;
 const goToUpdate=()=>{
  setNoticeDismissed(true);
  sectionRef.current?.focus({preventScroll:true});
  sectionRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
 };
 return <>
  <section ref={sectionRef} id="app-update" tabIndex={-1} className={'pwa-update '+(ready?'has-update':'')} aria-label="アプリの更新"><div><span className="eyebrow">APP UPDATE</span><p role="status">{state.message||'画面が古いと感じたときは、アプリの更新を確認できます。'}</p></div><button type="button" onClick={()=>ready?applyPwaUpdate():void checkPwaUpdate(true)} disabled={busy}>{state.phase==='applying'?'切り替え中…':state.phase==='checking'?'確認中…':ready?'最新版に更新':'アプリの更新を確認'}</button></section>
  {ready&&!noticeDismissed&&<aside className="pwa-update-notice" role="status" aria-label="アップデートのお知らせ"><button type="button" className="pwa-notice-jump" aria-controls="app-update" onClick={goToUpdate}><strong>新しいバージョンがあります</strong><span>タップして更新欄へ移動 ↓</span></button><button type="button" className="pwa-notice-close" aria-label="更新のお知らせを閉じる" onClick={()=>setNoticeDismissed(true)}>×</button></aside>}
 </>;
}

import {useSyncExternalStore} from 'react';
import {applyPwaUpdate,checkPwaUpdate,getPwaUpdate,subscribePwaUpdate} from './serviceWorkerUpdates';
import './pwa-update.css';
export default function PwaUpdate(){
 const state=useSyncExternalStore(subscribePwaUpdate,getPwaUpdate,getPwaUpdate);
 if(!import.meta.env.PROD||!('serviceWorker' in navigator))return null;
 const ready=state.phase==='available',busy=state.phase==='checking'||state.phase==='applying';
 return <section className={'pwa-update '+(ready?'has-update':'')} aria-label="アプリの更新"><div><span className="eyebrow">APP UPDATE</span><p role="status">{state.message||'画面が古いと感じたときは、アプリの更新を確認できます。'}</p></div><button type="button" onClick={()=>ready?applyPwaUpdate():void checkPwaUpdate(true)} disabled={busy}>{state.phase==='applying'?'切り替え中…':state.phase==='checking'?'確認中…':ready?'最新版に更新':'アプリの更新を確認'}</button></section>;
}

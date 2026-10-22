import {useEffect,useId,useRef,useState} from 'react';
import './mobile-controls.css';

type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>};
type InstallState='idle'|'installing'|'accepted'|'declined'|'failed'|'installed';
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
const isIos=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

export default function InstallApp(){
 const id=useId();
 const trigger=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const deferred=useRef<InstallPromptEvent|null>(null);
 const [available,setAvailable]=useState(false);
 const [state,setState]=useState<InstallState>(()=>isStandalone()?'installed':'idle');
 const [open,setOpen]=useState(false);
 const ios=isIos();
 const android=/Android/.test(navigator.userAgent);
 useEffect(()=>{
  const media=window.matchMedia('(display-mode: standalone)');
  const before=(event:Event)=>{event.preventDefault();deferred.current=event as InstallPromptEvent;setAvailable(true);if(!isStandalone())setState('idle');};
  const installed=()=>{deferred.current=null;setAvailable(false);setState('installed');};
  const mode=()=>{if(isStandalone())installed();};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installed);media.addEventListener('change',mode);
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installed);media.removeEventListener('change',mode);};
 },[]);
 const close=()=>{dialog.current?.close();setOpen(false);trigger.current?.focus();};
 const show=()=>{setOpen(true);dialog.current?.showModal();};
 const install=async()=>{
  const prompt=deferred.current;if(!prompt||state==='installing')return;
  // A browser install prompt may only be consumed once, directly from this click.
  deferred.current=null;setAvailable(false);setState('installing');
  try{await prompt.prompt();const choice=await prompt.userChoice;setState(current=>current==='installed'?current:choice.outcome==='accepted'?'accepted':'declined');}
  catch{setState(current=>current==='installed'?current:'failed');}
 };
 const message=state==='installed'?'アプリとして追加済みです。ホーム画面のアイコンから開けます。'
  :state==='installing'?'ブラウザの追加画面で操作を続けてください。'
  :state==='accepted'?'追加の操作を受け付けました。ホーム画面のアイコンを確認してください。'
  :state==='declined'?'今回は追加しませんでした。必要になったらブラウザのメニューから追加できます。'
  :state==='failed'?'追加画面を開けませんでした。下のブラウザ操作で追加してください。'
  :'いつもの電車を、ホーム画面からすぐに確認できます。';
 return <section className="install-app" aria-label="アプリのホーム画面追加">
  <div className="install-summary"><span className="eyebrow">ONE TAP TO YOUR TRAIN</span><p>{state==='installed'?'ホーム画面から、いつもの電車へ。':'ホーム画面から、すぐ「まにあう」。'}</p></div>
  <button type="button" ref={trigger} className="install-open" onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6m-3-3v6m-3 6h6"/></svg>{state==='installed'?'追加済み・使い方':'ホーム画面に追加'}</button>
  <dialog ref={dialog} id={id} className="install-dialog" aria-labelledby={`${id}-title`} onClose={()=>{setOpen(false);trigger.current?.focus();}} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{
   if(event.key!=='Tab')return;
   const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }} onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  }}>
   <div className="choice-dialog-header"><div><span className="eyebrow">TAKE THE BOARD WITH YOU</span><h2 id={`${id}-title`}>ホーム画面に追加</h2></div><button type="button" className="choice-close" aria-label="追加の案内を閉じる" onClick={close}>×</button></div>
   <div className="install-dialog-body">
    <div className="install-identity"><img src="/icon-192.png" alt="" width="56" height="56"/><div><strong>まにあう</strong><span>次の電車と、今いる場所にいられる時間。</span></div></div>
    <p className="install-status" role="status">{message}</p>
    {available&&state!=='installed'&&<button type="button" className="install-confirm" onClick={()=>void install()}>この端末に追加する</button>}
    {state!=='installed'&&<>
     {ios?<div className="install-instructions"><h3>iPhone・iPad / Safari</h3><ol><li>Safariでこのページを開き、<strong>共有</strong>をタップします。ページメニュー内にある場合もあります。</li><li><strong>ホーム画面に追加</strong>を選びます。表示されなければ「アクションを編集」で追加します。</li><li>「Webアプリとして開く」が表示されたらオンにして、<strong>追加</strong>をタップします。</li></ol><a href="https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios" target="_blank" rel="noreferrer">Appleのホーム画面追加ガイド ↗</a></div>
      :<div className="install-instructions"><h3>{android?'Android / Chrome':'ブラウザから追加する場合'}</h3><ol><li>ブラウザのメニューを開きます。Chromeでは右上の<strong>︙</strong>です。</li><li><strong>アプリをインストール</strong>または<strong>ホーム画面に追加</strong>を選びます。</li><li>名前を確認し、<strong>インストール / 追加</strong>を選びます。</li></ol><p>項目名は端末・ブラウザにより異なります。アプリ内ブラウザの場合はSafariやChromeでこのページを開いてください。</p></div>}
    </>}
    <p className="install-widget-note">ここで追加するのはWebアプリです。ホーム画面ウィジェットは、別途Android / iPhone用アプリを端末に導入して使います。</p>
    <button type="button" className="install-done" onClick={close}>案内を閉じる</button>
   </div>
  </dialog>
 </section>;
}

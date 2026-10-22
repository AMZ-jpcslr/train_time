import {useEffect,useRef,useState} from 'react';
import type {WidgetInput} from './domain/widget';
import {buildWidgetSnapshot} from './domain/widget';
import './widget-transfer.css';
type Bridge={postMessage:(json:string)=>void};
type NativeWindow=Window&{ManiauWidget?:Bridge;webkit?:{messageHandlers?:{maniauWidget?:Bridge}}};
const bridge=()=>{const w=window as NativeWindow;return w.ManiauWidget??w.webkit?.messageHandlers?.maniauWidget;};
export default function WidgetTransfer({input}:{input:WidgetInput}){
 const native=Boolean(bridge());
 const [status,setStatus]=useState('');
 const [sending,setSending]=useState(false);
 const pending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const available=buildWidgetSnapshot(input)!==null;
 useEffect(()=>{
  const result=(event:Event)=>{if(!pending.current)return;const detail=(event as CustomEvent).detail;if(!detail||typeof detail.ok!=='boolean')return;clearTimeout(timer.current);pending.current=false;setSending(false);setStatus(detail.ok?'ウィジェット用の情報を保存しました。ホーム画面で「まにあう」のウィジェットを追加してください。':'ウィジェットに保存できませんでした。アプリの接続先を確認して再度お試しください。');};
  window.addEventListener('maniauwidgetresult',result);
  return()=>{window.removeEventListener('maniauwidgetresult',result);clearTimeout(timer.current);pending.current=false;};
 },[]);
 const transfer=()=>{
  const data=buildWidgetSnapshot({...input,now:Date.now()});const target=bridge();
  if(!data||!target){setStatus('現在の時刻表を表示してから、もう一度保存してください。');return;}
  pending.current=true;setSending(true);setStatus('ウィジェットに保存しています…');
  timer.current=setTimeout(()=>{pending.current=false;setSending(false);setStatus('保存結果を確認できませんでした。ネイティブアプリを開き直してお試しください。');},5000);
  try{target.postMessage(JSON.stringify(data));}catch{clearTimeout(timer.current);pending.current=false;setSending(false);setStatus('ウィジェットへの送信に失敗しました。');}
 };
 return <section className="widget-transfer" aria-label="ホーム画面ウィジェット"><div><span className="eyebrow">HOME SCREEN WIDGET</span><h2>ホーム画面でも、出発の目安を。</h2><p>選んだ電車と次の便、今の場所を出る時刻を表示します。</p></div>{native?<div><button className="primary-button" onClick={transfer} disabled={!available||sending}>{sending?'保存中…':'選んだ電車をウィジェットに保存'}</button>{!available&&<p>実時刻の、確認済み時刻表を表示すると保存できます。</p>}<p>保存するのは次の5本です。発車済み・期限切れになったらアプリを開いて再保存してください。</p><p>背景での徒歩時間更新は、アプリ本体の「背景更新」でONにできます。登録地点は実測時間を使います。</p></div>:<p>ウィジェットにはAndroid・iPhone用の専用アプリのインストールが必要です。下のホーム画面追加はWebアプリとしての起動用です。専用アプリのソースと導入手順はリポジトリのnativeフォルダに収録しています。</p>}<p className="small-note">位置情報と時刻表には有効期限があります。古い情報では徒歩判定を表示しません。背景更新もOS・省電力設定で停止することがあります。</p>{status&&<p role="status">{status}</p>}</section>;
}

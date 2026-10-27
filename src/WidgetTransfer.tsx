import {useEffect,useRef,useState} from 'react';
import type {WidgetInput} from './domain/widget';
import {buildWidgetSnapshot} from './domain/widget';
import './widget-transfer.css';
type Bridge={postMessage:(json:string)=>void};
type NativeWindow=Window&{ManiauWidget?:Bridge;webkit?:{messageHandlers?:{maniauWidget?:Bridge}}};
const bridge=()=>{const w=window as NativeWindow;return w.ManiauWidget??w.webkit?.messageHandlers?.maniauWidget;};
export default function WidgetTransfer({input,unavailableReason}:{input:WidgetInput;unavailableReason?:string}){
 const native=Boolean(bridge());
 const [status,setStatus]=useState('');
 const [sending,setSending]=useState(false);
 const pending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const available=!unavailableReason&&buildWidgetSnapshot(input)!==null;
 useEffect(()=>{
  const result=(event:Event)=>{if(!pending.current)return;const detail=(event as CustomEvent).detail;if(!detail||typeof detail.ok!=='boolean')return;clearTimeout(timer.current);pending.current=false;setSending(false);setStatus(detail.ok?'ウィジェット用の情報を保存しました。ホーム画面で「まにあう」のウィジェットを追加してください。':'ウィジェットに保存できませんでした。アプリの接続先を確認して、もう一度保存してください。');};
  window.addEventListener('maniauwidgetresult',result);
  return()=>{window.removeEventListener('maniauwidgetresult',result);clearTimeout(timer.current);pending.current=false;};
 },[]);
 const transfer=()=>{
  if(unavailableReason){setStatus(unavailableReason);return;}
  const data=buildWidgetSnapshot({...input,now:Date.now()});const target=bridge();
  if(!data||!target){setStatus('現在の時刻表を表示してから、もう一度保存してください。');return;}
  pending.current=true;setSending(true);setStatus('ウィジェットに保存しています…');
  timer.current=setTimeout(()=>{pending.current=false;setSending(false);setStatus('保存結果を確認できませんでした。専用アプリを開き直して、もう一度保存してください。');},5000);
  try{target.postMessage(JSON.stringify(data));}catch{clearTimeout(timer.current);pending.current=false;setSending(false);setStatus('ウィジェットへの送信に失敗しました。');}
 };
 return <section className="widget-transfer" aria-label="ホーム画面ウィジェット"><div><h2>ホーム画面ウィジェット</h2><p>選んだ電車と次の便、ここを出る目安を保存して表示します。</p></div>{native?<div><button className="primary-button" onClick={transfer} disabled={!available||sending}>{sending?'保存中…':'選んだ電車をウィジェットに保存'}</button>{!available&&<p>{unavailableReason??'現在の日時で使える確認済み時刻表から、最大6時間先までの便を選ぶと保存できます。'}</p>}<p>選んだ便を含む最大5本を保存します。発車済み・期限切れになったらアプリを開いて保存し直してください。</p><p>画面を閉じた後の徒歩時間の更新は、専用アプリの「背景更新」でオンにできます。登録地点は実測時間を使います。</p></div>:<><p>Android・iPhone用の専用アプリが必要です。「ホーム画面に追加」で入るWebアプリには、ウィジェット機能はありません。</p><details><summary>専用アプリの導入について</summary><p>専用アプリのソースと導入手順は、リポジトリのnativeフォルダにあります。</p></details></>}<p className="small-note">位置情報と時刻表には有効期限があります。期限を過ぎると出発目安を表示しません。背景更新はOSや省電力設定で停止する場合があります。</p>{status&&<p role="status">{status}</p>}</section>;
}

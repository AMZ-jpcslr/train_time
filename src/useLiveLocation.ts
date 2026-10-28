import {useCallback,useEffect,useRef,useState} from 'react';
import type {Position} from './domain/types';
import {liveQuality,shouldRoute,subscribeLive} from './domain/liveLocation';
export function useLiveLocation(now:number,enabled:boolean,context:string){
 const [state,setState]=useState<{active:boolean;context:string;sample:Position|null;route:Position|null;message:string;session:number}>({active:false,context:'',sample:null,route:null,message:'位置情報は開始するまで取得しません。',session:0});
 const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearDeadline=()=>{if(deadline.current!==null)clearTimeout(deadline.current);deadline.current=null;};
 const release=useRef<(()=>void)|null>(null),generation=useRef(0),running=useRef(false),sessionContext=useRef('');
 const stop=useCallback((message='位置情報の更新を停止しました。')=>{generation.current++;clearDeadline();release.current?.();release.current=null;running.current=false;setState(p=>({...p,active:false,sample:null,route:null,message}));},[]);
 useEffect(()=>{if(running.current&&sessionContext.current!==context)stop('駅・方面・入口・日時が変わったため、位置情報の更新を停止しました。');},[context,stop]);
 useEffect(()=>{
  if(!enabled)return;
  const hide=()=>{if(document.hidden&&running.current)stop('画面を離れたため、位置情報の更新を停止しました。再開はボタンを押してください。');};
  const leave=()=>{if(running.current)stop('画面を離れたため、位置情報の更新を停止しました。');};
  document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',leave);
  return()=>{generation.current++;clearDeadline();release.current?.();release.current=null;running.current=false;document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',leave);};
 },[enabled,stop]);
 const start=()=>{
  if(!enabled||document.hidden)return;
  stop();
  if(!navigator.geolocation){setState(p=>({...p,message:'このブラウザーでは位置情報を使えません。徒歩時間を入力してください。'}));return;}
  const run=++generation.current;running.current=true;sessionContext.current=context;
  setState(p=>({active:true,context,sample:null,route:null,message:'現在地を確認しています。',session:p.session+1}));
  deadline.current=setTimeout(()=>{if(run===generation.current)stop('位置情報の取得がタイムアウトしました。再開するか、徒歩時間を入力してください。');},20000);
  release.current=subscribeLive(navigator.geolocation,sample=>{
   if(run!==generation.current)return;
   clearDeadline();
   setState(p=>({...p,sample,route:liveQuality(sample,Date.now())!=='fresh'?null:shouldRoute(p.route,sample)?sample:p.route}));
  },code=>{
   if(run!==generation.current)return;
   stop(code===1?'位置情報が許可されていません。徒歩時間を入力するか、ブラウザーの設定を確認してください。':code===3?'位置情報の取得がタイムアウトしました。再開するか、徒歩時間を入力してください。':'位置情報を取得できませんでした。再開するか、徒歩時間を入力してください。');
  });
 };
 const active=enabled&&state.active&&state.context===context,quality=liveQuality(state.sample,now);
 const position=active&&quality==='fresh'?state.sample:null;
 const routePosition=position&&liveQuality(state.route,now)==='fresh'?state.route:null;
 const message=!active?state.message:quality==='missing'?'現在地を確認しています（最大20秒）。':quality==='inaccurate'?'位置の誤差が大きいため、出発目安を止めています。開けた場所で待つか、徒歩時間を入力してください。':quality==='stale'?'新しい位置を取得できていないため、出発目安を止めています。位置情報を取り直すか、徒歩時間を入力してください。':quality==='invalid'?'位置情報を確認できません。再開するか、徒歩時間を入力してください。':'位置情報で更新中です。';
 return {active,position,sample:active?state.sample:null,routePosition,message,start,stop,session:state.session,waiting:active&&!position,quality};
}

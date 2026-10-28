import type {FormEvent,ReactNode} from 'react';
import type {Settings} from '../domain/types';
import MinuteWheel from './MinuteWheel';
export type WalkingPanel='choice'|'manual'|'location';
type Props={panel:WalkingPanel;onPanel:(panel:WalkingPanel)=>void;draft:string;onDraft:(value:string)=>void;onSubmit:(event:FormEvent)=>void;currentLabel:string;locationControls:ReactNode;entrance:ReactNode;hasEntrance:boolean;routeError?:string;routeLoading:boolean;accessUnverified:boolean;accessOffsets?:number[];walkMinutes:number|null;onRetry:()=>void;canRetry:boolean;locationDetails:ReactNode;advanced:ReactNode;settings:Settings;onStationMinutes:(value:number)=>void};
export default function RailWalkingSetup(props:Props){
 const duration=Number(props.draft),valid=props.draft.trim()!==''&&Number.isFinite(duration)&&duration>=0&&duration<=240&&duration*2===Math.round(duration*2);
 return <div className="rail-walking-setup">
  <p className="rail-walking-current" role="status">{props.currentLabel}</p>
  <div className="rail-mode-buttons" aria-label="徒歩時間の設定方法"><button type="button" aria-pressed={props.panel==='manual'} onClick={()=>props.onPanel('manual')}><span aria-hidden="true">123</span><strong>徒歩時間を入力</strong></button><button type="button" aria-pressed={props.panel==='location'} onClick={()=>props.onPanel('location')}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg><strong>位置情報で設定</strong></button></div>
  {props.panel==='manual'&&<form className="rail-manual-form" onSubmit={props.onSubmit}>
   <MinuteWheel value={props.draft} onChange={props.onDraft}/>
   <button className="primary-button rail-apply-walk" type="submit">{valid?`${Math.floor(duration)}分${duration%1?'30秒':''}で設定`:'この分数で設定'}</button>
  </form>}
  {props.panel==='location'&&<section className="rail-location-setup" aria-label="位置情報から徒歩時間を設定">
   {props.locationControls}
   {props.hasEntrance?<div className="rail-entrance-choice">{props.entrance}</div>:<p role="status">この駅の入口位置は未確認です。徒歩分数で設定できます。</p>}
   {props.routeLoading&&<p className="rail-route-state" role="status">徒歩経路を更新しています…</p>}
   {props.routeError&&<div className="rail-route-state" role="alert"><p>{props.routeError.includes('タイムアウト')?'徒歩経路の取得がタイムアウトしました。':'徒歩経路を取得できませんでした。'}</p><button type="button" onClick={props.onRetry} disabled={!props.canRetry}>もう一度取得</button><button type="button" onClick={()=>props.onPanel('manual')}>徒歩時間を入力して続ける</button></div>}
   {props.accessUnverified&&<div className="rail-route-state rail-access-check" role="status"><p>道路までの歩行を確認できません。</p>{props.accessOffsets&&<p>{props.accessOffsets.map((distance,index)=>distance>30?`${index===0?'現在地側':'駅入口側'} 約${Math.ceil(distance)}m`:null).filter(Boolean).join(' / ')}</p>}<p>徒歩時間を入力するか、上の駅入口を変更してください。</p><button type="button" onClick={()=>props.onPanel('manual')}>徒歩時間を入力して続ける</button></div>}
   {props.walkMinutes!==null&&!props.accessUnverified&&!props.routeError&&<div className="rail-gps-duration"><span>駅入口まで</span><strong>{props.walkMinutes}<small>分</small></strong></div>}
   <details className="rail-setup-help"><summary>位置情報・経路の詳細</summary>{props.locationDetails}</details>
  </section>}
  <label className="rail-station-margin">駅入口からホームまで<span><input type="number" aria-label="入口からホームまでの時間（分）" min="0" max="60" step="1" value={props.settings.stationMinutes} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=60)props.onStationMinutes(value);}}/>分</span><small>乗車までの余裕を含めて設定</small></label>
  <details className="rail-setup-help"><summary>登録地点・歩行速度など</summary><p>入力した徒歩時間は、駅の変更やページの再読み込みで解除されます。次回も使う時間は、登録地点として保存できます。</p>{props.advanced}</details>
 </div>;
}

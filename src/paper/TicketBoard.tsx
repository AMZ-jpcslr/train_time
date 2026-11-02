import {useState,type ReactNode} from 'react';
import {leavingWindow,type Walking} from '../domain/journey';
import {formatClock} from '../domain/time';
import type {Settings} from '../domain/types';
import {departureKey,type ScheduledDeparture} from '../useTrainSelection';
import {nearbyDepartures,ticketState} from './model';
export default function TicketBoard({trains,now,walk,settings,context,directions,locationMessage,onWalk,empty,reference,controls,preview}:{trains:ScheduledDeparture[];now:number;walk:Walking;settings:Settings;context:string;directions:ReactNode;locationMessage:string;onWalk:()=>void;empty:ReactNode;reference:boolean;controls:ReactNode;preview:boolean}){
 const [expanded,setExpanded]=useState<{context:string;key:string}|null>(null);
 const visible=nearbyDepartures(trains,now);
 return <section className="paper-board" aria-label="時刻順の電車">
 <div className="paper-heading"><div><span className="paper-kicker">DEPARTURES</span><h1>次の電車、まにあう？</h1></div><div className="paper-clock"><span>{preview?'指定時刻 / JST':'現在時刻 / JST'}</span><strong>{formatClock(now).slice(0,5)}</strong></div></div>
 {directions}{controls}
 <div className="paper-legend" aria-label="乗車の目安"><span className="miss">間に合わない</span><span className="tight">急げば間に合う</span><span className="comfortable">余裕あり</span></div>
 <p className="paper-note">{reference?'現行ダイヤ未確認の参考時刻です。出発目安は計算しません。':'定刻・徒歩の目安です。遅延や運休は反映していません。'}</p>
 <ol className="paper-timeline">{visible.map((train,index)=>{
 const key=departureKey(train),open=expanded?.context===context&&expanded.key===key;
 const status=ticketState(train,now,walk,settings),window=leavingWindow(train.epoch,now,walk,settings);
 const seconds=window?Math.max(0,Math.floor(window.remainingMs/1000)):0;
 const id='ticket-detail-'+index;
 return <li key={key} className={'paper-ticket '+status.kind+(open?' expanded':'')} data-state={status.kind}>
 <button className="ticket-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(old=>old?.context===context&&old.key===key?null:{context,key})}>
 <span className="ticket-time">{train.time}<small>発</small></span>
 <span className="ticket-service"><small>{train.trainType??'種別未収録'}</small><strong>{train.destination}{train.destination==='行先未収録'?'':' 行き'}</strong><span className="ticket-status">{status.label}</span></span>
 <span className="ticket-expand" aria-hidden="true">{open?'−':'＋'}</span>
 </button>
 {open&&<div className="ticket-detail" id={id}>
 {status.kind==='past'?<p>定刻の発車時刻を過ぎています。次の便を確認してください。</p>:window?<>
 <span className="paper-kicker">ここにいられる目安</span><p className="ticket-remaining" role="timer" aria-live="off">{window.remainingMs<0?'出る目安を過ぎています':<><strong>{Math.floor(seconds/60)}</strong>分 <strong>{String(seconds%60).padStart(2,'0')}</strong>秒</>}</p>
 <p>出る目安 <b>{formatClock(window.leaveAt).slice(0,5)}</b> ／ 徒歩 {'minutes' in walk?walk.minutes:'—'}分 ＋ 駅構内・余裕 {settings.stationMinutes}分</p>
 {status.kind==='tight'&&<p>設定した徒歩速度での計算です。駆け込み乗車はお控えください。</p>}</>:<p>{reference?'時刻表の現行確認が必要です。':locationMessage} 徒歩時間を入力して確認することもできます。</p>}
 {(train.platform||Number.isInteger(train.carCount)&&train.carCount!>0)&&<p className="ticket-metadata">{train.platform&&<span>{train.platform}番線</span>}{Number.isInteger(train.carCount)&&train.carCount!>0&&<span>{train.carCount}両編成</span>}</p>}
 <button className="paper-text-button" onClick={onWalk}>徒歩時間を設定</button>
 </div>}
 </li>;})}</ol>
 {visible.length>0&&!visible.some(train=>train.epoch>now)&&<p role="status">この運行日の便は終了しました。別の日・時刻を確認できます。</p>}
 {!visible.length&&empty}
 </section>;
}

import './train-choices.css';
import {leavingWindow,judge,type Walking} from './domain/journey';
import type {Settings} from './domain/types';
import {departureKey,departureRank,type ScheduledDeparture} from './useTrainSelection';

export default function TrainChoices({trains,selected,now,walk,settings,placeName,onSelect,countdown}:{trains:ScheduledDeparture[];selected:ScheduledDeparture;now:number;walk:Walking;settings:Settings;placeName?:string;onSelect:(train:ScheduledDeparture)=>void;countdown:(epoch:number)=>string}){
 return <>
  <div className="following-heading"><span>乗りたい電車を選ぶ</span><span>次の{trains.length}本</span></div>
  <p className="train-choice-help">電車を選ぶと、上の出発案内が切り替わります。</p>
  <div className="following-list" role="group" aria-label="乗りたい電車">
   {trains.map((train,index)=>{
    const j=judge(train.epoch,now,walk,settings),stay=leavingWindow(train.epoch,now,walk,settings);
    const active=departureKey(train)===departureKey(selected);
    const label=!stay?'計算できません':stay.remainingMs<0?'出発目安を過ぎています':stay.remainingMs===0?'出発の目安は今です':`あと${Math.floor(stay.seconds/60)}分${String(stay.seconds%60).padStart(2,'0')}秒`;
    return <button type="button" className="following-row train-choice" key={departureKey(train)} aria-pressed={active} aria-label={`${departureRank(index)} ${train.time}発 ${train.destination}行きを選ぶ`} onClick={()=>onSelect(train)}>
     <span className="choice-time"><small>{departureRank(index)}</small><time>{train.time}</time></span>
     <span className="following-destination"><span>{train.trainType??'種別不明'}</span><strong>{train.destination}</strong><small>{train.platform?`${train.platform}番線`:'番線未確認'}</small></span>
     <span className="following-right"><small>発車まで</small><strong>{countdown(train.epoch)}</strong><span className={j.status}>{j.label}</span></span>
     <span className={`choice-stay ${j.status}`}><span>{placeName?'登録地点':'今の場所'}にいられる目安</span><strong>{label}</strong></span>
     <span className="choice-action">{active?'✓ 選択中':'この電車を選ぶ →'}</span>
    </button>;
   })}
  </div>
 </>;
}

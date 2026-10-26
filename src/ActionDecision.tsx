import type {Settings} from './domain/types';
import {judge,type Walking} from './domain/journey';
import {departureRank,type ScheduledDeparture} from './useTrainSelection';
import StayTime from './StayTime';
import TrainTypeBadge from './TrainTypeBadge';

export default function ActionDecision({train,now,walk,settings,stationId,placeName,preview,onConditions,rank}:{train:ScheduledDeparture;now:number;walk:Walking;settings:Settings;stationId:string;placeName?:string;preview:boolean;onConditions:()=>void;rank:number}){
 const result=judge(train.epoch,now,walk,settings);
 return <div className="action-decision next-train" aria-label="選んだ電車と出発目安">
  <div className="action-primary"><StayTime departure={train.epoch} now={now} walk={walk} settings={settings} placeName={placeName} preview={preview} display="clock"/></div>
  <div className="action-service">
  <div className="action-kicker"><span>選んだ電車 <small className="pill">{departureRank(rank)}</small></span><div className={'judgment '+result.status}><strong>{result.label}</strong></div></div>
  <div className="action-train destination-row"><p className="decision-train"><strong>{train.time} 発</strong></p><div className="action-destination"><strong>{train.destination}{train.destination==='行先未収録'?'':'行き'}</strong><small><TrainTypeBadge stationId={stationId} type={train.trainType}/> · {train.platform?`${train.platform}番線`:'番線未確認'}</small></div></div>
  </div>
  <button className="action-conditions" onClick={onConditions}><span>{'minutes' in walk?`徒歩 ${walk.minutes}分 ＋ 構内・余裕 ${settings.stationMinutes}分`:'徒歩時間を確認する'}</span><strong>計算条件 →</strong></button>
  <p className="decision-countdown">予定発車まで {Math.max(0,Math.ceil((train.epoch-now)/60000))}分 · 遅延・運休は未反映</p>
 </div>;
}

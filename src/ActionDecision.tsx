import type {Settings} from './domain/types';
import {leavingWindow,type Walking} from './domain/journey';
import {formatClock} from './domain/time';
import {trainTypeName} from './domain/trainFilter';
import type {ScheduledDeparture} from './useTrainSelection';

export default function ActionDecision({train,now,walk,settings,placeName,preview,onConditions,manual=false,reference=false}:{train:ScheduledDeparture;now:number;walk:Walking;settings:Settings;stationId:string;placeName?:string;preview:boolean;onConditions:()=>void;rank:number;manual?:boolean;reference?:boolean}){
 const window=reference?null:leavingWindow(train.epoch,now,walk,settings);
 return <section className="chosen-decision" tabIndex={-1} aria-label="選んだ電車と出発目安">
  <p className="selection-mode">{manual?'選んだ電車':'条件に合う次の電車'}{reference?'（参考情報）':''}</p>
  <div className="chosen-service"><strong>{train.time}</strong><span>{trainTypeName(train)} · {train.destination} 行</span></div>
  {window?<><p>{placeName?`登録地点「${placeName}」にいられる目安`:'ここにいられる目安'}{preview?'（指定時刻での試算）':''}</p><div className="chosen-remaining">{window.remainingMs<0?<strong className="past-leave">出発目安を過ぎています</strong>:<><b>{Math.floor(window.seconds/60)}</b><span>分</span><b>{String(window.seconds%60).padStart(2,'0')}</b><span>秒</span></>}</div><p className="chosen-leave">出る目安 <time dateTime={new Date(window.leaveAt).toISOString()}>{formatClock(window.leaveAt).slice(0,5)}</time></p><button className="walk-condition-link" onClick={onConditions}>徒歩 {'minutes' in walk?walk.minutes:0}分 ＋ 駅構内・余裕 {settings.stationMinutes}分を変更</button>{window.remainingMs<0&&<p>余裕を持って乗れるよう、後の便を選んでください。</p>}</>:<div className="walk-setup"><h3>{reference?'公式時刻表を確認してください':'徒歩時間を入れて、出る目安を確認'}</h3><p>{reference?'現行ダイヤが未確認のため、出発目安には使いません。':'駅と乗りたい電車を選び、徒歩時間を設定してください。位置情報を使うか、駅入口までの分数を入力できます。'}</p>{!reference&&<button className="primary-button" onClick={onConditions}>徒歩時間を設定する</button>}</div>}
  <p className="chosen-disclaimer">時刻表・徒歩時間・駅構内の移動と余裕時間からの目安です。遅延・運休は未反映で、乗車を保証しません。</p>
 </section>;
}

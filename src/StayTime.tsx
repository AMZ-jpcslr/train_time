import {leavingWindow,type Walking} from './domain/journey';
import {formatClock} from './domain/time';
import type {Settings} from './domain/types';

export default function StayTime({departure,now,walk,settings,placeName,preview}:{departure:number;now:number;walk:Walking;settings:Settings;placeName?:string;preview:boolean}){
 const window=leavingWindow(departure,now,walk,settings);
 const past=window!==null&&window.remainingMs<0;
 return <div className={`stay-time ${!window?'unavailable':past?'past':''}`} aria-label="今いる場所の出発目安">
  <div className="stay-heading"><span className="eyebrow">TIME TO LEAVE</span><span>{preview?'指定時刻での試算 · ':''}選択した電車に乗る場合</span></div>
  <p className="stay-origin">{placeName?`登録地点「${placeName}」にいられる目安`:'今の場所にいられる目安'}</p>
  <strong className="stay-countdown">{!window?'計算できません':past?'出発目安を過ぎています':window.remainingMs===0?'出発の目安は今です':<>あと <b>{Math.floor(window.seconds/60)}</b>分 <b>{String(window.seconds%60).padStart(2,'0')}</b>秒</>}</strong>
  {window&&<p className="stay-deadline">{placeName?'登録地点':'今の場所'}を出る目安 <time>{formatClock(window.leaveAt)}</time></p>}
  <p className="stay-note">{!window?'徒歩時間・位置情報・時刻表を確認できると表示します。':past?'余裕を持って、後の便をご検討ください。':`入口まで徒歩 ${'minutes' in walk?walk.minutes:'—'}分 ＋ ホーム移動・乗車余裕 ${settings.stationMinutes}分を差し引いた目安です。`}</p>
 </div>;
}

import {availability, selectTable, serviceDate} from '../domain/time';
import {serviceTimeline} from '../domain/timeline';
import {judge, leavingWindow} from '../domain/journey';
import type {Timetable} from '../domain/types';

export const PREVIEW_TIME = Date.parse('2026-10-26T14:00:00+09:00');
export type Design = 'board' | 'action' | 'favorites';
export type Scenario = 'normal' | 'unsupported' | 'missing' | 'expired' | 'failed' | 'reference' | 'denied' | 'loading' | 'offline' | 'ended';
export const scenarioLabels: Record<Scenario,string> = {normal:'通常',unsupported:'未対応',missing:'当日のデータなし',expired:'確認期限切れ',failed:'通信失敗',reference:'参考表示',denied:'位置情報の許可なし',loading:'読み込み中',offline:'オフライン',ended:'終電後'};
export const statusCopy = {
 unsupported: ['この方面の時刻表は未対応です','公式の時刻表で発車時刻を確認してください。お気に入りや駅の変更もできます。'],
 missing: ['この日の時刻表がありません','別の日の時刻表では出発目安を計算できません。公式の時刻表を確認してください。'],
 expired: ['時刻表の確認期限を過ぎています','時刻表を再確認するまで出発目安は表示しません。公式の最新情報を確認してください。'],
 failed: ['時刻表を読み込めませんでした','通信状態を確認して、もう一度読み込んでください。'],
 reference: ['参考時刻です','現行ダイヤとの照合が終わっていないため、出発目安は計算できません。公式の時刻表を確認してください。'],
 denied: ['位置情報を使えません','駅入口までの実測時間を入力すると、出発目安を確認できます。'],
 loading: ['時刻表を読み込み中です','駅・方面を変えることもできます。'],
 offline: ['オフラインです','確認期限内の保存済み時刻表を表示しています。出発目安には実測時間が必要です。最新の運行情報は取得できません。'],
 ended: ['この運行日の発車は終了しました','24時以降の便も含め、収録された発車予定はすべて過ぎています。次の運行日は公式で確認してください。'],
};
export function previewModel(tables:Timetable[], stationId:string, directionId:string, scenario:Scenario, walk:number|null, inside:number, selectedTime:string|null, realNow=Date.now()) {
 const now=scenario==='ended'?Date.parse('2026-10-27T03:59:00+09:00'):PREVIEW_TIME;
 const day=serviceDate(now),table=selectTable(tables,stationId,directionId,day);
 const state=availability(table,day,realNow);
 const blocked=['unsupported','missing','expired','failed','loading'].includes(scenario)||!['ready','unverified'].includes(state)||(state==='unverified'&&table?.verification!=='partial');
 const trains=blocked?[]:serviceTimeline(table,day);
 const future=trains.filter(t=>t.epoch>now);
 const walkState=walk===null||scenario==='reference'||state!=='ready'?{kind:'unavailable' as const}:{kind:'measured' as const,minutes:walk};
 const settings={stationMinutes:inside,speedKmh:4.8};
 const preferred=future.find(t=>judge(t.epoch,now,walkState,settings).status==='comfortable')??future[0];
 const selected=future.find(t=>t.time===selectedTime)??preferred;
 const result=selected?judge(selected.epoch,now,walkState,settings):null;
 const leaving=selected?leavingWindow(selected.epoch,now,walkState,settings):null;
 const dataIssue=state==='missing'?'missing':state==='expired'?'expired':state!=='ready'?'reference':null;
 // Offline is a transport state, never proof of having a usable saved timetable.
 // End-of-service is only known from a usable table including 24:xx departures.
 const issue=(scenario==='offline'||scenario==='ended')&&dataIssue?dataIssue:scenario!=='normal'?scenario:dataIssue??(future.length===0?'ended':null);
 return {now,day,table,state,trains,future,selected,result,leaving,issue};
}

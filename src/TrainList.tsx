import {departureKey,type ScheduledDeparture} from './useTrainSelection';
import {trainTypeName} from './domain/trainFilter';
export default function TrainList({trains,selected,onSelect}:{trains:ScheduledDeparture[];selected?:ScheduledDeparture;onSelect:(t:ScheduledDeparture)=>void}){
 return <div className="vertical-trains" aria-label="便の候補">{trains.map(train=>{const active=selected&&departureKey(train)===departureKey(selected);return <button className="vertical-train" key={departureKey(train)} aria-pressed={Boolean(active)} onClick={()=>onSelect(train)}><time>{train.time}</time><span><b>{trainTypeName(train)}</b><span>{train.destination} 行</span>{train.platform&&<small>{train.platform}番線</small>}</span><span className="train-choice-label">{active?'選択中':'この便を選ぶ'}</span></button>;})}</div>;
}

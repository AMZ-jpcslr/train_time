import type {CSSProperties} from 'react';
import {trainTypeColor} from './domain/trainType';

export default function TrainTypeBadge({stationId,type}:{stationId:string;type:string|null}){
 const color=trainTypeColor(stationId,type);
 return <span className="train-type" data-type-color={color??'unconfirmed'} style={{'--type-color':color??'#727D78'} as CSSProperties} title={color?'種別色：公式時刻表・路線案内に基づく':'種別色は未確認のため共通色'}>{type??'種別不明'}</span>;
}

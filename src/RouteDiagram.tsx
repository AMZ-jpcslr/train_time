import type {WalkingRoute}from'./domain/types';
export default function RouteDiagram({route}:{route:WalkingRoute}){
 const points=route.geometry;const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
 const minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...lats),maxY=Math.max(...lats);
 const cos=Math.cos((minY+maxY)/2*Math.PI/180),span=Math.max((maxX-minX)*cos,maxY-minY,.0003);
 const xy=(p:number[])=>[50+((p[0]-minX)*cos/span)*140,160-((p[1]-minY)/span)*140];
 const start=xy(points[0]),end=xy(points[points.length-1]);
 return <figure className="route-diagram"><svg viewBox="0 0 280 180" role="img" aria-label="取得した徒歩経路の形状。背景地図はありません。"><polyline points={points.map(xy).map(p=>p.join(',')).join(' ')} fill="none" stroke="#cbe69c" strokeWidth="3"/><circle cx={start[0]} cy={start[1]} r="5" fill="#72c3ec"/><circle cx={end[0]} cy={end[1]} r="5" fill="#f8cf83"/><text x={start[0]+8} y={start[1]-8} fill="#bed9eb" fontSize="11">現在地</text><text x={end[0]+8} y={end[1]+16} fill="#f8cf83" fontSize="11">入口</text></svg><figcaption>歩行経路の形状（背景地図なし）</figcaption></figure>;
}

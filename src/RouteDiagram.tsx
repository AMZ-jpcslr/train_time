import type {WalkingRoute}from'./domain/types';
export default function RouteDiagram({route}:{route:WalkingRoute}){
 const points=route.geometry;
 const origin=[route.origin.lon,route.origin.lat],destination=route.destination?[route.destination.lon,route.destination.lat]:points[points.length-1];
 // Iterate bounds; avoid spreading route vertices into the JavaScript call stack.
 const {minX,maxX,minY,maxY}=[origin,...points,destination].reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1])}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
 const cos=Math.cos((minY+maxY)/2*Math.PI/180),span=Math.max((maxX-minX)*cos,maxY-minY,.0003);
 const xy=(p:number[])=>[50+((p[0]-minX)*cos/span)*140,160-((p[1]-minY)/span)*140];
 const start=xy(origin),end=xy(destination),roadStart=xy(points[0]),roadEnd=xy(points[points.length-1]);
 return <figure className="route-diagram"><svg viewBox="0 0 280 180" role="img" aria-label="取得した徒歩経路。実線は道路経路、破線は道路までの接続概算。背景地図はありません。"><polyline points={points.map(xy).map(p=>p.join(',')).join(' ')} fill="none" stroke="#cbe69c" strokeWidth="3"/><path d={`M${start.join(' ')} L${roadStart.join(' ')} M${roadEnd.join(' ')} L${end.join(' ')}`} fill="none" stroke="#e8cf87" strokeWidth="2" strokeDasharray="4 4"/><circle cx={start[0]} cy={start[1]} r="5" fill="#72c3ec"/><circle cx={end[0]} cy={end[1]} r="5" fill="#f8cf83"/><text x={start[0]+8} y={start[1]-8} fill="#bed9eb" fontSize="11">現在地</text><text x={end[0]+8} y={end[1]+16} fill="#f8cf83" fontSize="11">入口</text></svg><figcaption>実線：道路経路 / 破線：接続区間の概算（背景地図なし）</figcaption></figure>;
}

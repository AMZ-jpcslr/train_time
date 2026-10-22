import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const raw=JSON.parse(await readFile('.cache/osm/entrances.json','utf8'));
const meta=JSON.parse(await readFile('.cache/osm/entrances-meta.json','utf8'));
const reviewed=JSON.parse(await readFile('scripts/reviews/osm-entrances.json','utf8'));
// Explicitly reviewed station entrances. Nearby shops/other operators and closed entries are not included.
const selected=[
 ['kobe-myohoji',8967449216,'駅舎入口（地図登録地点）','OSM駅舎way/507542455上の入口。南側駅前広場に接続。'],
 ['jr-nishinomiya',3960824202,'南側入口','OSM train_station_entrance。'],
 ['jr-nishinomiya',3960824206,'北側入口','OSM train_station_entrance。'],
 ['jr-osaka',3375274239,'桜橋口','OSMに入口名が登録されています。'],
 ['jr-osaka',3448863956,'御堂筋南口','OSMに入口名が登録されています。'],
 ['jr-osaka',5178004149,'御堂筋北口','OSMに入口名が登録されています。'],
 ['jr-osaka',5342194712,'中央北口','OSMに入口名が登録されています。'],
 ['jr-osaka',5358890779,'中央南口','OSMに入口名が登録されています。'],
 ['jr-ibaraki',5308312727,'東側入口','OSM train_station_entrance。'],
 ['jr-ibaraki',5983012817,'西側入口','OSM train_station_entrance。'],
 ['jr-minamikusatsu',6897564065,'西側入口','OSM南草津駅舎way/245427493上の入口、歩道way/736717874に接続。'],
 ['kyoto-imadegawa',6483284116,'2番出入口','OSM subway_entrance / ref=2。'],
 ['kyoto-imadegawa',11364685914,'1番出入口','OSM subway_entrance / ref=1。'],
 ['kyoto-imadegawa',1224217711,'南側エレベーター出入口','OSM subway_entrance / name=今出川 / wheelchair=yes。'],
 ['hankyu-rokko',1700410818,'北東側入口','OSM train_station_entrance。'],
 ['hankyu-rokko',13475656920,'北側入口','OSM train_station_entrance。'],
 ['hankyu-sannomiya',2563975998,'西口','OSM駅舎way/249846423上の入口、name=西口。'],
 ['hankyu-umeda',5261546898,'駅ビル1階西側入口','OSM大阪梅田駅舎way/139168082上。地上歩道way/589357473と屋内通路way/544282679に接続。改札・神戸線ホームは上階です。'],
 ['hanshin-koshien',7627826584,'東側入口','OSM train_station_entrance。臨時出口は採用していません。'],
 ['hanshin-koshien',13382690030,'西側入口','OSM train_station_entrance。臨時出口は採用していません。']
];
const entrances=selected.map(([stationId,id,name,note])=>{const n=raw.elements.find(n=>n.id===id);if(!n||(!n.tags?.entrance&&!n.tags?.railway)||['no','private'].includes(n.tags?.access))throw Error('Entrance changed: '+id);return{id:'osm-'+id,stationId,name,lat:n.lat,lon:n.lon,sourceUrl:'https://www.openstreetmap.org/node/'+id,checkedAt:meta.retrievedAt,note};});
for(const e of entrances){const proof=reviewed.find(x=>x.id===e.id&&x.stationId===e.stationId),n=raw.elements.find(n=>e.id==='osm-'+n.id);if(!proof||proof.lat!==e.lat||proof.lon!==e.lon||['railway','entrance','name','ref'].some(k=>proof[k] !== (n.tags?.[k]??null)))throw Error('駅入口の座標またはタグ変更を検出。駅舎への接続を再確認してください: '+e.id);}
const gakuen=JSON.parse(await readFile('scripts/reviews/gakuentoshi-entrances.json','utf8'));
const source=await readFile(gakuen.source.rawCache);
if(createHash('sha256').update(source).digest('hex')!==gakuen.source.sha256)throw Error('学園都市入口の原資料が変更されています。出口名・座標の再照合が必要です。');
entrances.push(...gakuen.entrances);
await writeFile('src/data/entrances.json',JSON.stringify(entrances,null,2)+'\n');
console.log(entrances.length,'reviewed station entrances (20 OSM + 2 Ekitan)');

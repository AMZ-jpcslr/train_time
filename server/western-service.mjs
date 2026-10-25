import {createHash,randomUUID} from 'node:crypto';
import catalog from './western-feeds.json' with {type:'json'};
import {releaseLock} from './redis.mjs';
const ROOT='https://api.transit.ls8h.com',TTL=3600000;
const feeds=new Map(catalog.feeds.map(f=>[f.feedId,f]));
const operator=id=>id.startsWith('jrwest-')?'JR西日本':id==='scrape-hankyu'?'阪急電鉄':'阪神電気鉄道';
export const westernCoverage=catalog.feeds.map(f=>({operator:operator(f.feedId),line:f.name,sourceUrl:f.downloadUrl,sourceRetrievedAt:f.fetchedAt}));
function decode(id){
 if(typeof id!=='string'||!/^western-[A-Za-z0-9_-]{10,900}$/.test(id))throw Error('西日本APIの駅識別子が不正です。');
 const raw=Buffer.from(id.slice(8),'base64url').toString('utf8'),feed=raw.split(':')[0];
 if(!feeds.has(feed)||!raw.startsWith(feed+':')||raw.length>600||/[\x00-\x1f/\\?#]/.test(raw)||Buffer.from(raw).toString('base64url')!==id.slice(8))throw Error('西日本APIの駅識別子が不正です。');
 return {raw,feed};
}
export function westernStation(detail){
 const feed=feeds.get(detail?.feedId);
 if(!feed||typeof detail.id!=='string'||!detail.id.startsWith(feed.feedId+':')||typeof detail.name!=='string'||!detail.name||detail.name.length>100
  ||!Number.isFinite(detail.lat)||!Number.isFinite(detail.lon)||detail.lat<20||detail.lat>50||detail.lon<120||detail.lon>150||!Array.isArray(detail.routes))throw Error('西日本APIの駅情報を確認できませんでした。');
 const lines=[...new Set(detail.routes.filter(r=>r.mode==='rail'&&typeof r.name==='string'&&r.name.length<200).map(r=>r.name))];
 if(!lines.length)throw Error('西日本APIの鉄道路線を確認できませんでした。');
 const id='western-'+Buffer.from(detail.id).toString('base64url');decode(id);
 return {id,name:detail.name,operator:operator(feed.feedId),line:lines.join('・'),code:feed.feedId.startsWith('jrwest-')?'JR':feed.feedId==='scrape-hankyu'?'阪急':'阪神',lat:detail.lat,lon:detail.lon,
  directions:[{id:'all',name:'全方面（各便の行先を確認）'}],sourceUrl:feed.downloadUrl,region:'西日本 · 非公式API・参考時刻',westernProvider:feed.feedId,timetablePath:'/api/western/timetable?station='+id};
}
export function createWesternService({redis=null,prefix='maniau-v1',local=false,fetchImpl=fetch,clock=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const memory=new Map(),pending=new Map();let last=0;
 const status=()=>({enabled:local||Boolean(redis),coverage:westernCoverage});
 async function slot(){
  if(redis&&!local){for(let i=0;i<60;i++){if(await redis.command('SET',prefix+':western:slot','1','NX','PX',1100))return;await delay(250);}throw Error('西日本APIが混雑しています。時間をおいて再検索してください。');}
  const wait=Math.max(0,1100-(clock()-last));if(wait)await delay(wait);last=clock();
 }
 async function request(path){
  await slot();
  try{const r=await fetchImpl(ROOT+path,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('upstream');
   const reader=r.body.getReader(),parts=[];let bytes=0;
   for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2*1024*1024){await reader.cancel();throw Error('large');}parts.push(value);}
   return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }catch{throw Error('西日本APIを取得できませんでした。公式時刻表も確認してください。');}
 }
 async function cached(key,loader,ttl=TTL){
  if(!status().enabled)throw Error('西日本APIには共有キャッシュの設定が必要です。');
  const hash=createHash('sha256').update(key).digest('hex'),cacheKey=prefix+':western:v1:'+hash;
  const hit=memory.get(hash);if(hit&&hit.until>clock())return hit.value;
  if(pending.has(hash))return pending.get(hash);
  const task=(async()=>{
   if(redis&&!local){const raw=await redis.command('GET',cacheKey);if(raw){const entry=JSON.parse(raw);if(entry&&Number.isFinite(entry.until)&&entry.until>clock()){memory.set(hash,entry);return entry.value;}}}
   const lock=cacheKey+':lock',owner=randomUUID();let owns=false;
   try{
    if(redis&&!local){owns=Boolean(await redis.command('SET',lock,owner,'NX','PX',180000));if(!owns)throw Error('西日本APIを取得中です。少し待って再試行してください。');}
    const value=await loader(),entry={value,until:clock()+ttl};if(redis&&!local)await redis.command('SET',cacheKey,JSON.stringify(entry),'PX',ttl);
    if(memory.size>=256)memory.delete(memory.keys().next().value);memory.set(hash,entry);return value;
   }finally{if(owns)await releaseLock(redis,lock,owner).catch(()=>{});}
  })();pending.set(hash,task);try{return await task;}finally{pending.delete(hash);}
 }
 const detail=raw=>cached('detail:'+raw,async()=>{
  const value=await request('/api/v1/stations/'+encodeURIComponent(raw));if(value?.id!==raw)throw Error('西日本APIの駅が一致しません。');return westernStation(value);
 },6*TTL);
 return {status,
  async search(query){
   if(typeof query!=='string'||query.length>60||!query.trim()||/[\x00-\x1f]/.test(query))throw Error('西日本APIは1〜60文字の駅名で検索してください。');
   const normalized=query.normalize('NFKC').trim(),filter=/JR西日本|JR|ＪＲ/i.test(normalized)?'JR西日本':/阪急/.test(normalized)?'阪急電鉄':/阪神/.test(normalized)?'阪神電気鉄道':null;
   const q=normalized.replace(/JR西日本|JR|阪急電鉄|阪急|阪神電気鉄道|阪神/gi,'').trim();if(!q)throw Error('西日本APIは事業者名に続けて駅名を入力してください。');
   return cached('search:'+normalized,async()=>{
    const value=await request('/api/v1/locations/suggest?q='+encodeURIComponent(q)+'&limit=30');if(!Array.isArray(value?.stations)||value.stations.length>30)throw Error('西日本APIの検索結果を確認できませんでした。');
    const rows=[...new Map(value.stations.filter(s=>feeds.has(s.feedId)&&s.kind!=='stop'&&typeof s.id==='string'&&s.id.startsWith(s.feedId+':')&&(!filter||operator(s.feedId)===filter)).map(s=>[s.id,s])).values()];
    const stations=[];for(const row of rows.slice(0,8))stations.push(await detail(row.id));
    return {stations,limited:rows.length>8,checkedAt:new Date(clock()).toISOString()};
   },6*TTL);
  },
  async timetable(id,day){
   const {raw,feed}=decode(id);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Error('西日本APIの運行日が不正です。');
   const meta=feeds.get(feed),compact=day.replaceAll('-','');if(compact<meta.serviceStart||compact>meta.serviceEnd)throw Error('西日本APIの収録期間外です。公式時刻表を確認してください。');
   return cached('table:'+id+':'+day,async()=>{
    const station=await detail(raw),seen=new Set(),rows=[];let cursor=4*3600,limited=false;
    for(let page=0;page<20;page++){
     const time=[Math.floor(cursor/3600),Math.floor(cursor/60)%60,cursor%60].map(n=>String(n).padStart(2,'0')).join(':');
     const value=await request('/api/v1/stations/'+encodeURIComponent(raw)+'/departures?date='+compact+'&time='+time+'&limit=100');
     if(value?.stationId!==raw||value.date!==compact||value.timezone!=='Asia/Tokyo'||!Array.isArray(value.departures)||value.departures.length>100)throw Error('西日本APIの駅・運行日を確認できませんでした。');
     let previous=-Infinity;for(const row of value.departures){
      if(!Number.isInteger(row.departureSecs)||row.departureSecs<cursor||row.departureSecs<previous||typeof row.tripId!=='string'||typeof row.stopId!=='string'||row.mode!=='rail')throw Error('西日本APIの発車時刻を確認できませんでした。');
      previous=row.departureSecs;if(row.departureSecs>=28*3600||row.headwayBased)continue;
      const key=row.tripId+'|'+row.stopId+'|'+row.departureSecs;if(!seen.has(key)){seen.add(key);rows.push(row);}
     }
     if(value.departures.length<100||previous>=28*3600)break;
     if(previous<=cursor||page===19){limited=true;break;}cursor=previous;
    }
    if(!rows.length)throw Error('西日本APIには指定日の発車便が収録されていません。公式時刻表を確認してください。');
    const checkedAt=new Date(clock()).toISOString();
    return [{id:id+'-'+day,stationId:id,operator:station.operator,line:station.line,directionId:'all',direction:station.directions[0].name,dayType:'weekday',
     departures:rows.sort((a,b)=>a.departureSecs-b.departureSecs).map(row=>({time:[Math.floor(row.departureSecs/3600),Math.floor(row.departureSecs/60)%60,row.departureSecs%60].map(n=>String(n).padStart(2,'0')).join(':'),destination:typeof row.headsign==='string'&&row.headsign.trim()?row.headsign.trim():'行先未収録',trainType:typeof row.trainType==='string'?row.trainType:null,platform:null})),
     sourceUrl:'https://api.transit.ls8h.com/',retrievedAt:checkedAt,checkedAt,validFrom:day,validTo:day,serviceDates:[day],revisionDate:null,verification:'partial',notes:[
      'Transit APIの非公式データを加工。正確性・完全性・最新性は未確認のため参考表示に限り、乗車可否の判定は行いません。',
      '出典：'+meta.attribution+'。原典：'+meta.downloadUrl+'。原典の利用条件が適用されます。',
      'APIに登録された原資料の取得日：'+meta.fetchedAt+'。このアプリの取得日とは異なります。',
      '全方面をまとめて表示しています。各便の行先を確認してください。運休・遅延、臨時列車や翌日未明の便の網羅は未確認です。',
      ...(!rows.every(row=>typeof row.headsign==='string'&&row.headsign.trim())?['APIで行先が欠落している便は「行先未収録」と表示。時刻から方面・行先・種別を推測しません。']:[]),
      ...(limited?['APIの取得上限に達したため、一部の便のみ表示しています。']:[]),
      '利用条件：https://transit.ls8h.com/terms 。運行前に鉄道事業者の公式時刻表を確認してください。',
     ]}];
   });
  },
 };
}

import {mkdir,readFile,writeFile,rename,readdir,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {challengeProviders,CHALLENGE_END} from './odpt-challenge-providers.mjs';
import {createOdptTokenReader} from './odpt-token.mjs';
import {normalizeChallenge,challengeDayTables} from './odpt-challenge-normalize.mjs';
import {releaseLock} from './redis.mjs';
const TTL=6*3600000,MAX_BYTES=96*1024*1024;
const TYPES=['Railway','Station','StationTimetable','TrainType','RailDirection'];
export function createChallengeService({env={},local=false,redis=null,prefix='maniau-v1',fetchImpl=fetch,clock=Date.now,
 tokenReader=createOdptTokenReader(env,{local}),cacheDir=new URL('../.cache/odpt-challenge/',import.meta.url),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const memory=new Map(),pending=new Map(),backoff=new Map(),stationMetadata=new Map();let tail=Promise.resolve(),last=0,purged=false;
 const remainingTtl=()=>Math.max(1,Math.min(TTL,Date.parse('2027-03-13T00:00:00+09:00')-clock()));
 const validSnapshot=(v,id)=>v?.version===3&&(id!=='keio'||v.calendarSupport===1)&&v.provider===id&&Array.isArray(v.stations)&&v.tables&&Number.isFinite(Date.parse(v.checkedAt))
  &&clock()-Date.parse(v.checkedAt)<TTL&&clock()>=Date.parse(v.checkedAt)-30000;
 async function status(){
  const configured=Boolean(await tokenReader()),ended=new Date(clock()+9*3600000).toISOString().slice(0,10)>CHALLENGE_END;
  if(ended&&!purged){
   memory.clear();
   if(local){
    const ids=challengeProviders.map(p=>p.id);
    const names=await readdir(cacheDir).catch(()=>[]);
    for(const name of names)if(ids.some(id=>name===id+'.json.gz'||new RegExp(`^${id}-source-[a-f0-9]{64}[.]json[.]gz$`).test(name)))await unlink(new URL(name,cacheDir)).catch(()=>{});
   }
   purged=true;
  }
  return {configured,enabled:configured&&!ended&&(local||Boolean(redis)),reason:ended?'チャレンジ2026のデータ提供期間が終了しました。':!configured?'チャレンジ2026用トークンが未設定です。':!local&&!redis?'認証付きデータには共有キャッシュの設定が必要です。':null};
 }
 async function cached(id){
  if(validSnapshot(memory.get(id),id))return memory.get(id);
  try{
   let value;
   if(local)value=JSON.parse(gunzipSync(await readFile(new URL(id+'.json.gz',cacheDir)),{maxOutputLength:MAX_BYTES}).toString());
   else if(redis){
    const manifest=JSON.parse(await redis.command('GET',`${prefix}:odpt-challenge:${id}`)||'null');
    if(!manifest||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>32||!/^[a-f0-9]{64}$/.test(manifest.hash))return null;
    const chunks=[];for(let i=0;i<manifest.parts;i++)chunks.push(await redis.command('GET',`${prefix}:odpt-challenge:${id}:${manifest.hash}:${i}`));
    if(chunks.some(v=>typeof v!=='string'||v.length>700000))return null;
    const raw=Buffer.from(chunks.join(''),'base64');if(createHash('sha256').update(raw).digest('hex')!==manifest.hash)return null;
    value=JSON.parse(gunzipSync(raw,{maxOutputLength:MAX_BYTES}).toString());
   }
   if(validSnapshot(value,id)){memory.set(id,value);return value;}
  }catch{/* Corrupt/expired cache is never displayed. Reacquire through the gate. */}
  return null;
 }
 async function save(value){
  const compressed=gzipSync(JSON.stringify(value)),id=value.provider;
  if(local){await mkdir(cacheDir,{recursive:true});const file=new URL(id+'.json.gz',cacheDir),temp=new URL(id+'.'+randomUUID()+'.tmp',cacheDir);await writeFile(temp,compressed);await rename(temp,file);}
  else{
   const hash=createHash('sha256').update(compressed).digest('hex'),text=compressed.toString('base64'),parts=Math.ceil(text.length/700000);
   if(parts>32)throw Error('ODPTキャッシュの許容サイズを超えました。');
   for(let i=0;i<parts;i++)await redis.command('SET',`${prefix}:odpt-challenge:${id}:${hash}:${i}`,text.slice(i*700000,(i+1)*700000),'PX',remainingTtl());
   await redis.command('SET',`${prefix}:odpt-challenge:${id}`,JSON.stringify({hash,parts}),'PX',remainingTtl());
  }
  memory.set(id,value);
 }
 async function slot(){
  if(redis&&!local){for(let i=0;i<60;i++){if(await redis.command('SET',`${prefix}:odpt-challenge:slot`,'1','NX','PX',1100))return;await delay(250);}throw Error('ODPT取得が混雑しています。しばらく待って再試行してください。');}
  const wait=Math.max(0,1100-(clock()-last));if(wait)await delay(wait);last=clock();
 }
 async function resource(type,provider,token,{railway,metadataOperator,calendarRef}={}){
  await slot();
  const url=new URL(`https://api-challenge.odpt.org/api/v4/odpt:${type}`);
  if(type!=='RailDirection')url.searchParams.set('odpt:operator',metadataOperator||provider.operator);
  if(railway)url.searchParams.set('odpt:railway',railway);
  if(calendarRef)url.searchParams.set('owl:sameAs',calendarRef);
  url.searchParams.set('acl:consumerKey',token);
  // Errors and response bodies can contain the request URL; never expose either.
  try{
   const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error('Upstream rejected request');
   if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Too large');
   const reader=response.body.getReader(),chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('Too large');}chunks.push(value);}
   const text=Buffer.concat(chunks).toString('utf8');if(text.includes(token))throw Error('Credential echoed by provider');
   const rows=JSON.parse(text);
   if(!Array.isArray(rows)||rows.length>100000||rows.some(row=>!row||typeof row!=='object'))throw Error('Invalid response');
   return rows;
  }catch{throw Error('ODPTデータを取得できませんでした。トークンの種類・通信状態・提供状況を確認してください。');}
 }
 async function acquire(provider){
  const config=await status();if(!config.enabled)throw Error('ODPT '+config.reason);
  const hit=await cached(provider.id);if(hit)return hit;
  if((backoff.get(provider.id)||0)>clock())throw Error('ODPT取得は一時停止中です。15分後に再試行してください。');
  const lock=`${prefix}:odpt-challenge:lock:${provider.id}`,owner=randomUUID();let owns=false;
  try{
   if(redis&&!local){owns=Boolean(await redis.command('SET',lock,owner,'NX','PX',300000));if(!owns)throw Error('ODPTデータを別の要求で取得中です。しばらく待って再試行してください。');}
   const token=await tokenReader(),data={};
   for(const type of TYPES){
    data[type]=await resource(type,provider,token);
    // The API caps an unpartitioned response at 1,000 objects. Fetch each
    // official railway separately whenever that ceiling is reached.
    if(data[type].length>=1000&&(type==='Station'||type==='StationTimetable')){
     const rows=[];
     for(const line of data.Railway){
      const railway=line['owl:sameAs'];if(typeof railway!=='string'||!railway.startsWith('odpt.Railway:'))throw Error('ODPT路線識別子が不正です。');
      const part=await resource(type,provider,token,{railway});
      if(part.length>=1000)throw Error('ODPT路線単位の取得上限に達したため表示を保留しました。');
      rows.push(...part);
     }
     const indexed=new Map();for(const row of rows){const ref=row['owl:sameAs'];if(!ref)throw Error('ODPT識別子を確認できませんでした。');indexed.set(ref,row);}
     data[type]=[...indexed.values()];
    }
   }
   const specialCalendars=[...new Set(data.StationTimetable.map(row=>row['odpt:calendar']))].filter(ref=>typeof ref==='string'&&/^odpt[.]Calendar:Specific[.][A-Za-z0-9._-]+$/.test(ref));
   if(specialCalendars.length>64)throw Error('ODPT特別運行区分の許容数を超えました。');
   data.Calendar=[];
   for(const calendarRef of specialCalendars){const rows=await resource('Calendar',provider,token,{calendarRef}),matched=rows.filter(row=>row['owl:sameAs']===calendarRef);if(matched.length!==1)throw Error('ODPT特別運行日を確認できませんでした。');data.Calendar.push(...matched);}
   const stationIds=new Set(data.Station.map(row=>row['owl:sameAs']));
   const missing=[...new Set(data.StationTimetable.flatMap(t=>(t['odpt:stationTimetableObject']||[]).flatMap(d=>Array.isArray(d['odpt:destinationStation'])?d['odpt:destinationStation']:typeof d['odpt:destinationStation']==='string'?[d['odpt:destinationStation']]:[])))].filter(ref=>!stationIds.has(ref)&&typeof ref==='string'&&/^odpt[.]Station:[A-Za-z0-9._-]+$/.test(ref));
   const operators=[...new Set(missing.map(ref=>'odpt.Operator:'+ref.split(':')[1].split('.')[0]))];
   for(const metadataOperator of operators){
    const metadata=stationMetadata.get(metadataOperator);let resolved=metadata&&clock()-metadata.checkedAt<TTL?metadata.rows:null;
    if(!resolved){
     // Destination metadata may be unavailable even when the timetable is valid.
     resolved=await resource('Station',provider,token,{metadataOperator}).catch(()=>[]);
     stationMetadata.set(metadataOperator,{rows:resolved,checkedAt:clock()});
    }
    // Only explicitly requested metadata may be merged into the lookup.
    for(const row of resolved)if(missing.includes(row['owl:sameAs'])&&!stationIds.has(row['owl:sameAs'])){data.Station.push(row);stationIds.add(row['owl:sameAs']);}
   }
   const raw=Buffer.from(JSON.stringify(data)),sourceHash=createHash('sha256').update(raw).digest('hex');
   if(local){
    await mkdir(cacheDir,{recursive:true});await writeFile(new URL(`${provider.id}-source-${sourceHash}.json.gz`,cacheDir),gzipSync(raw));
   }
   const normalized=normalizeChallenge(provider,data,new Date(clock()).toISOString());normalized.sourceHash=sourceHash;
   await save(normalized);return normalized;
  }catch(error){backoff.set(provider.id,clock()+15*60000);throw error;}
  finally{if(owns)await releaseLock(redis,lock,owner).catch(()=>{});}
 }
 function snapshot(id){
  const provider=challengeProviders.find(p=>p.id===id);if(!provider)throw Error('ODPT事業者が不正です。');
  if(!pending.has(id)){
   // One provider acquisition at a time per instance; repeated clicks share it.
   const promise=tail.catch(()=>{}).then(()=>acquire(provider));tail=promise;
   pending.set(id,promise.finally(()=>pending.delete(id)));
  }
  return pending.get(id);
 }
 return {status,
  async catalog(id){const value=await snapshot(id);return{stations:value.stations,coverage:value.coverage};},
  async timetable(stationId,day){
   const provider=challengeProviders.find(p=>new RegExp(`^challenge-${p.id}-[a-f0-9]{16}$`).test(stationId));
   if(!provider)throw Error('ODPTの駅識別子が不正です。');
   return challengeDayTables(await snapshot(provider.id),stationId,day,clock());
  },
 };
}

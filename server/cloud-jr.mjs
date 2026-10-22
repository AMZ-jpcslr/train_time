import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {collectJr,JR_SCOPE_VERSION,validDate,currentJrServiceDate} from '../scripts/import-jr.mjs';
import {validateResult} from './jr-service.mjs';
import {ASSERT_LOCK,releaseLock} from './redis.mjs';
const TTL=6*3600000, BACKOFF=15*60000, LEASE=280000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const STORE_OWNED=`-- store-owned-jr-result
if redis.call('GET',KEYS[1]) ~= ARGV[1] or redis.call('PTTL',KEYS[1]) < 1000 then return 0 end
redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]); return 1`;
export function createCloudJrService({redis,prefix='maniau-v1',clock=Date.now,loader}={}) {
 const inflight=new Map(),lockKey=`${prefix}:jr:acquisition`;
 const unavailable=(day,message,retryMs=BACKOFF)=>({schemaVersion:JR_SCOPE_VERSION,serviceDate:day,tables:[],status:'unavailable',source:'none',fetchedAt:null,expiresAt:null,retryAfter:new Date(clock()+retryMs).toISOString(),errors:[message]});
 function fresh(result){const stamps=result.tables.map(t=>Date.parse(t.retrievedAt));return stamps.every(t=>t<=clock()&&clock()-t<TTL);}
 function ready(day,result,source){const stamp=Math.min(...result.tables.map(t=>Date.parse(t.retrievedAt)));return{schemaVersion:JR_SCOPE_VERSION,serviceDate:day,tables:result.tables,status:'ready',source,fetchedAt:new Date(stamp).toISOString(),expiresAt:new Date(stamp+TTL).toISOString(),retryAfter:null,errors:[]};}
 async function readShared(day,cacheKey,failureKey){
  const raw=await redis.command('GET',cacheKey);
  if(raw){try{const value=JSON.parse(raw);if(value.version!==JR_SCOPE_VERSION||value.serviceDate!==day||value.sha256!==digest(value.result))throw Error('Invalid envelope');const result=validateResult(day,value.result);if(fresh(result))return ready(day,result,'cache');}catch{/* Invalid or expired records are never served. */}}
  const failed=await redis.command('GET',failureKey);
  if(failed){try{const failure=JSON.parse(failed);if(failure.serviceDate===day&&failure.nextAttemptAt>clock()&&failure.nextAttemptAt<=clock()+BACKOFF)return unavailable(day,'JRの公開時刻表を取得できませんでした。再試行時刻までお待ちください。',failure.nextAttemptAt-clock());}catch{/* Invalid failure metadata cannot supply timetable data. */}}
  return null;
 }
 async function acquire(day){
  if(!redis)return unavailable(day,'JRの日次取得には共有キャッシュの環境変数が必要です。');
  const cacheKey=`${prefix}:jr:v${JR_SCOPE_VERSION}:${day}`,failureKey=`${cacheKey}:failure`,token=randomUUID();let locked=false;
  try{
   const cached=await readShared(day,cacheKey,failureKey);if(cached)return cached;
   locked=await redis.command('SET',lockKey,token,'NX','PX',LEASE)==='OK';
   if(!locked)return unavailable(day,'別の運行日の時刻表を取得中です。少し待って更新してください。',15000);
   // Another instance may have filled the cache between our GET and SET NX.
   const afterLock=await readShared(day,cacheKey,failureKey);if(afterLock)return afterLock;
   const signal=AbortSignal.timeout(260000);
   const beforeRequest=async()=>{signal.throwIfAborted();if(await redis.command('EVAL',ASSERT_LOCK,1,lockKey,token,25000)!==1)throw Error('Acquisition lease expired');};
   let root;
   try{
    await beforeRequest();
    root=await mkdtemp(path.join(tmpdir(),'maniau-jr-'));
    const result=validateResult(day,await(loader?loader(day,{root,signal,beforeRequest}):collectJr({day,refresh:true,root,sourceOptions:{signal,beforeRequest}})));
    signal.throwIfAborted();if(!fresh(result))throw Error('Stale source timestamp');
    const envelope={version:JR_SCOPE_VERSION,serviceDate:day,sha256:digest(result),result};
    const remaining=TTL-(clock()-Math.min(...result.tables.map(t=>Date.parse(t.retrievedAt))));
    if(await redis.command('EVAL',STORE_OWNED,2,lockKey,cacheKey,token,JSON.stringify(envelope),Math.max(1,Math.floor(remaining)))!==1)throw Error('Acquisition lease expired');
    await redis.command('DEL',failureKey);
    return ready(day,result,'network');
   }catch{
    // No raw provider error, source HTML or secret can reach the public API.
    await redis.command('EVAL',STORE_OWNED,2,lockKey,failureKey,token,JSON.stringify({serviceDate:day,nextAttemptAt:clock()+BACKOFF}),BACKOFF);
    return unavailable(day,'JRの公開時刻表を取得・検証できませんでした。別日の表は使用しません。');
   }finally{if(root){const resolved=path.resolve(root),base=path.resolve(tmpdir());if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith('maniau-jr-'))throw Error('Unexpected temporary workspace');await rm(resolved,{recursive:true,force:true});}}
  }catch{return unavailable(day,'共有キャッシュに接続できません。外部取得を停止しています。');}
  finally{if(locked){try{await releaseLock(redis,lockKey,token);}catch{/* Lease expires; never bypass the shared lock. */}}}
 }
 function getJrTimetables(day){validDate(day);const delta=(Date.parse(day)-Date.parse(currentJrServiceDate(clock())))/86400000;if(delta< -1||delta>31)throw Error('JRの運行日は前日から31日先まで指定できます。');if(inflight.has(day))return inflight.get(day);const task=acquire(day);inflight.set(day,task);task.finally(()=>inflight.delete(day)).catch(()=>{});return task;}
 return{getJrTimetables};
}

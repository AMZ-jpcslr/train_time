import {randomUUID} from 'node:crypto';
import {releaseLock} from './redis.mjs';
// Redis TIME is the authority across instances. Only random tokens and times are stored.
export const ROUTING_ACQUIRE=`-- routing-acquire-global
local ts=redis.call('TIME'); local now=tonumber(ts[1])*1000+math.floor(tonumber(ts[2])/1000)
local blocked=tonumber(redis.call('GET',KEYS[4]) or '0')
if blocked>now then return {0,'backoff',blocked-now} end
if redis.call('EXISTS',KEYS[1])==1 then return {0,'busy',1000} end
local last=tonumber(redis.call('GET',KEYS[3]) or '0')
if now-last<1100 then return {0,'interval',1100-(now-last)} end
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now-86400000)
if redis.call('ZCARD',KEYS[2])>=120 or redis.call('ZCOUNT',KEYS[2],now-3600000,'+inf')>=30 then return {0,'quota',60000} end
redis.call('SET',KEYS[1],ARGV[1],'PX',45000)
redis.call('ZADD',KEYS[2],now,ARGV[1]); redis.call('PEXPIRE',KEYS[2],86400000)
redis.call('SET',KEYS[3],now,'PX',86400000)
return {1,'ok',0}`;
export const ROUTING_BACKOFF=`-- routing-provider-backoff
local ts=redis.call('TIME'); local now=tonumber(ts[1])*1000+math.floor(tonumber(ts[2])/1000)
local expires=now+tonumber(ARGV[1]);local current=tonumber(redis.call('GET',KEYS[1]) or '0')
if expires>current then redis.call('SET',KEYS[1],expires,'PX',ARGV[1]) end
return 1`;
export function createRoutingGate({redis,prefix='maniau-v1',wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const keys=['lease','attempts','last','blocked'].map(s=>`${prefix}:routing:${s}`);
 return{
  async acquire(){
   if(!redis)throw Error('徒歩経路には共有キャッシュの設定が必要です。');
   const token=randomUUID();
   // One bounded wait for the minimum interval; do not queue an unbounded cloud invocation.
   for(let attempt=0;attempt<2;attempt++){
    const result=await redis.command('EVAL',ROUTING_ACQUIRE,4,...keys,token);
    if(result?.[0]===1)return async()=>{await releaseLock(redis,keys[0],token);};
    if(result?.[1]==='interval'&&attempt===0){await wait(Math.min(1100,Math.max(1,Number(result[2]))));continue;}
    if(result?.[1]==='quota')throw Error('公開試用の経路取得上限に達しました（アプリ全体で30回/時・120回/日）。');
    throw Error('経路サービスが混雑しています。しばらく待って再度お試しください。');
   }
  },
  async backoff(ms){if(redis)await redis.command('EVAL',ROUTING_BACKOFF,1,keys[3],ms);}
 };
}

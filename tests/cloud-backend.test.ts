import {describe,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-expect-error Node server module
import {createRedis,releaseLock} from '../server/redis.mjs';
// @ts-expect-error Node server module
import {createCloudJrService} from '../server/cloud-jr.mjs';
// @ts-expect-error Node server module
import {createRoutingGate} from '../server/cloud-routing.mjs';
// @ts-expect-error Node server module
import {createCloudServices,deploymentOrigin} from '../server/cloud-services.mjs';
// @ts-expect-error Exact deployed entry point
import {createServerlessHandler} from '../api/index.mjs';
import tables from '../src/data/jr.json';

const day='2026-10-22',epoch=Date.parse('2026-10-22T04:00:00Z');
function fixture(date=day){const selected=tables.filter(t=>t.serviceDates[0]===day).map(t=>({...structuredClone(t),id:`${t.stationId}-${t.directionId}-${date}`,serviceDates:[date],validFrom:date,validTo:date,retrievedAt:new Date(epoch).toISOString(),checkedAt:new Date(epoch).toISOString(),sourceUrl:t.sourceUrl.replace('20261022',date.replaceAll('-',''))}));return{tables:selected,evidence:selected.map(t=>({id:t.id,sourceUrl:t.sourceUrl,retrievedAt:t.retrievedAt,count:t.departures.length,scope:{version:2,sourceCount:t.departures.length,excluded:[]},displayedDateMatched:true,pcMobileAllTimesAndPlatformsMatched:true,duplicates:0,sorted:true}))};}

/** Deterministic Redis contract double. Production Lua still needs a real Redis deployment smoke test. */
class RedisDouble{
 now=epoch; calls:unknown[][]=[]; values=new Map<string,{value:string,until:number}>();attempts:number[]=[];
 get(k:string){const x=this.values.get(k);if(x&&x.until>this.now)return x.value;this.values.delete(k);return null;}
 put(k:string,v:string,ttl:number){this.values.set(k,{value:v,until:this.now+ttl});}
 async command(...args:any[]):Promise<any>{
  this.calls.push(args);const [cmd,...a]=args;
  if(cmd==='PING')return 'PONG';
  if(cmd==='GET')return this.get(a[0]);
  if(cmd==='DEL')return this.values.delete(a[0])?1:0;
  if(cmd==='SET'){if(a.includes('NX')&&this.get(a[0]))return null;this.put(a[0],a[1],Number(a[a.indexOf('PX')+1]));return 'OK';}
  if(cmd==='EVAL'){
   const [script,n,...rest]=a,keys=rest.slice(0,n),argv=rest.slice(n);
   if(script.includes('release-owned-lock')){if(this.get(keys[0])===argv[0])return this.values.delete(keys[0])?1:0;return 0;}
   if(script.includes('assert-owned-live-lock'))return this.get(keys[0])===argv[0]&&this.values.get(keys[0])!.until-this.now>=Number(argv[1])?1:0;
   if(script.includes('store-owned-jr-result')){if(this.get(keys[0])!==argv[0]||this.values.get(keys[0])!.until-this.now<1000)return 0;this.put(keys[1],argv[1],Number(argv[2]));return 1;}
   if(script.includes('routing-provider-backoff')){const until=Math.max(this.now+Number(argv[0]),Number(this.get(keys[0])||0));this.put(keys[0],String(until),until-this.now);return 1;}
   if(script.includes('routing-acquire-global')){
    const blocked=Number(this.get(keys[3])||0);if(blocked>this.now)return[0,'backoff',blocked-this.now];
    if(this.get(keys[0]))return[0,'busy',1000];
    const last=Number(this.get(keys[2])||0);if(this.now-last<1100)return[0,'interval',1100-(this.now-last)];
    this.attempts=this.attempts.filter(t=>this.now-t<86400000);if(this.attempts.length>=120||this.attempts.filter(t=>this.now-t<=3600000).length>=30)return[0,'quota',60000];
    this.put(keys[0],argv[0],45000);this.attempts.push(this.now);this.put(keys[2],String(this.now),86400000);return[1,'ok',0];
   }
  }
  throw Error(`Unexpected test command ${cmd}`);
 }
}
const origin={lat:35,lon:135},entrance={id:'e',stationId:'s',lat:35.001,lon:135};
const walkingFixture=()=>({code:'Ok',routes:[{distance:130,duration:104,geometry:{type:'LineString',coordinates:[[135,35],[135,35.001]]},legs:[{steps:[{mode:'walking',distance:130}]}]}],waypoints:[{location:[135,35],distance:0},{location:[135,35.001],distance:0}]});

describe('shared JR cache and acquisition lease',()=>{
 it('shares exact-day data between instances and writes only in a temporary directory',async()=>{
  const redis=new RedisDouble(),loader=vi.fn(async(_date:string,options:any)=>{expect(path.relative(tmpdir(),options.root)).not.toMatch(/^\.\./);await options.beforeRequest();return fixture();});
  const a=createCloudJrService({redis,loader,clock:()=>redis.now}),b=createCloudJrService({redis,loader,clock:()=>redis.now});
  const result=await a.getJrTimetables(day);expect(result.status).toBe('ready');expect(result.tables).toHaveLength(8);expect(result.expiresAt).toBe('2026-10-22T10:00:00.000Z');expect((await b.getJrTimetables(day)).source).toBe('cache');expect(loader).toHaveBeenCalledTimes(1);
 });
 it('blocks another instance and another date while acquisition is in progress',async()=>{
  const redis=new RedisDouble();let release!:()=>void;const entered=new Promise<void>(resolve=>{release=resolve;});let start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});
  const loader=vi.fn(async()=>{start();await entered;return fixture();});const a=createCloudJrService({redis,loader,clock:()=>redis.now}),b=createCloudJrService({redis,loader,clock:()=>redis.now});
  const pending=a.getJrTimetables(day);await started;expect((await b.getJrTimetables('2026-10-23')).status).toBe('unavailable');expect(loader).toHaveBeenCalledTimes(1);release();expect((await pending).status).toBe('ready');
 });
 it('rechecks the cache after winning a lease so a recently completed peer is not fetched again',async()=>{
  const redis=new RedisDouble();await createCloudJrService({redis,loader:async()=>fixture(),clock:()=>redis.now}).getJrTimetables(day);
  const key='maniau-v1:jr:v2:'+day,saved=redis.get(key)!,original=redis.command.bind(redis);redis.values.delete(key);let installed=false;
  redis.command=async(...args:any[])=>{if(args[0]==='SET'&&args[1]==='maniau-v1:jr:acquisition'&&!installed){installed=true;redis.put(key,saved,21600000);}return original(...args);};
  const loader=vi.fn(async()=>fixture());expect((await createCloudJrService({redis,loader,clock:()=>redis.now}).getJrTimetables(day)).source).toBe('cache');expect(loader).not.toHaveBeenCalled();
 });
 it('shares 15-minute failures, never leaks provider errors, and does not substitute another date',async()=>{
  const redis=new RedisDouble(),loader=vi.fn(async()=>{throw Error('secret-token upstream raw HTML');});const a=createCloudJrService({redis,loader,clock:()=>redis.now});
  const failed=await a.getJrTimetables(day);expect(JSON.stringify(failed)).not.toContain('secret-token');expect(failed.retryAfter).toBe('2026-10-22T04:15:00.000Z');
  await createCloudJrService({redis,loader,clock:()=>redis.now}).getJrTimetables(day);expect(loader).toHaveBeenCalledTimes(1);
  const wrong=createCloudJrService({redis,loader:async()=>fixture(),clock:()=>redis.now});expect((await wrong.getJrTimetables('2026-10-23')).status).toBe('unavailable');
  redis.now+=900001;await a.getJrTimetables(day);expect(loader).toHaveBeenCalledTimes(2);
 });
 it('rejects future/expired/tampered caches and lease loss before source requests',async()=>{
  const redis=new RedisDouble();await createCloudJrService({redis,loader:async()=>fixture(),clock:()=>redis.now}).getJrTimetables(day);
  const key='maniau-v1:jr:v2:'+day,raw=JSON.parse(redis.get(key)!);raw.result.tables[0].departures[0].destination='改変';redis.put(key,JSON.stringify(raw),21600000);
  const fail=vi.fn(async(_day:string,options:any)=>{redis.put('maniau-v1:jr:acquisition','other-owner',280000);await options.beforeRequest();return fixture();});
  expect((await createCloudJrService({redis,loader:fail,clock:()=>redis.now}).getJrTimetables(day)).status).toBe('unavailable');expect(redis.get('maniau-v1:jr:acquisition')).toBe('other-owner');
  redis.values.clear();redis.now=epoch-1;expect((await createCloudJrService({redis,loader:async()=>fixture(),clock:()=>redis.now}).getJrTimetables(day)).status).toBe('unavailable');
  redis.values.clear();redis.now=epoch+21600000;expect((await createCloudJrService({redis,loader:async()=>fixture(),clock:()=>redis.now}).getJrTimetables(day)).status).toBe('unavailable');
 });
 it('fails closed when Redis is missing or unreachable and validates operating dates',async()=>{
  const loader=vi.fn(),missing=createCloudJrService({loader,clock:()=>epoch});expect((await missing.getJrTimetables(day)).status).toBe('unavailable');
  expect(()=>missing.getJrTimetables('2026-02-30')).toThrow();expect(()=>missing.getJrTimetables('2026-12-31')).toThrow();
  const down={command:async()=>{throw Error('secret');}};expect((await createCloudJrService({redis:down,loader,clock:()=>epoch}).getJrTimetables(day)).status).toBe('unavailable');expect(loader).not.toHaveBeenCalled();
 });
});

describe('distributed foot provider limits',()=>{
 it('serializes instances, spaces calls, and releases only the owning lease',async()=>{
  const redis=new RedisDouble(),wait=async(ms:number)=>{redis.now+=ms;},a=createRoutingGate({redis,wait}),b=createRoutingGate({redis,wait});const release=await a.acquire();
  await expect(b.acquire()).rejects.toThrow('混雑');expect(await releaseLock(redis,'maniau-v1:routing:lease','wrong')).toBe(0);await release();
  const second=await b.acquire();expect(redis.attempts[1]-redis.attempts[0]).toBeGreaterThanOrEqual(1100);await second();expect(JSON.stringify(redis.calls)).not.toContain('35.001');
 });
 it('enforces rolling global hourly/daily limits and provider backoff',async()=>{
  const redis=new RedisDouble(),gate=createRoutingGate({redis,wait:async(ms:number)=>{redis.now+=ms;}});
  for(let i=0;i<30;i++)await(await gate.acquire())();await expect(gate.acquire()).rejects.toThrow('30回');
  redis.now+=3600001;redis.attempts=Array.from({length:120},(_,i)=>redis.now-4000000-i);await expect(gate.acquire()).rejects.toThrow('120回');
  redis.attempts=[];await gate.backoff(60000);await expect(gate.acquire()).rejects.toThrow('混雑');redis.now+=60001;await(await gate.acquire())();
 });
 it('releases the shared lease after provider failure and coordinates 429 backoff',async()=>{
  const redis=new RedisDouble(),fetchImpl=vi.fn(async()=>({ok:false,status:429}));
  const service=await createCloudServices({APP_ORIGIN:'https://train.example',ROUTING_CONTACT_EMAIL:'operator@example.test'},{redis,entrances:[entrance],fetchImpl,clock:()=>redis.now});
  await expect(service.route({origin,stationId:'s',entranceId:'e'})).rejects.toThrow('429');expect(redis.get('maniau-v1:routing:lease')).toBeNull();
  const other=await createCloudServices({APP_ORIGIN:'https://train.example',ROUTING_CONTACT_EMAIL:'operator@example.test'},{redis,entrances:[entrance],fetchImpl,clock:()=>redis.now});
  await expect(other.route({origin,stationId:'s',entranceId:'e'})).rejects.toThrow('混雑');expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it('uses the configured application origin and never stores coordinates in Redis',async()=>{
  const redis=new RedisDouble(),fetchImpl=vi.fn(async(_url:URL,options:any)=>{expect(options.headers.Referer).toBe('https://train.example/');return{ok:true,json:async()=>walkingFixture()};});
  const service=await createCloudServices({APP_ORIGIN:'https://train.example',ROUTING_CONTACT_EMAIL:'operator@example.test'},{redis,entrances:[entrance],fetchImpl,clock:()=>redis.now});
  expect((await service.getConfig()).enabled).toBe(true);expect((await service.route({origin,stationId:'s',entranceId:'e'})).kind).toBe('route');expect(JSON.stringify(redis.calls)).not.toContain('35.001');expect(JSON.stringify(redis.calls)).not.toContain('135');
 });
});

describe('configuration, Redis transport and deployed request dispatch',()=>{
 it('reports missing/down configuration without phantom availability',async()=>{
  const missing=await createCloudServices({},{redis:null,entrances:[]});expect(await missing.getConfig()).toMatchObject({enabled:false,jrEnabled:false,sharedControls:'missing',localPrototype:false});
  const down=await createCloudServices({APP_ORIGIN:'https://train.example',ROUTING_CONTACT_EMAIL:'operator@example.test'},{redis:{command:async()=>{throw Error('secret');}},entrances:[]});expect(await down.getConfig()).toMatchObject({enabled:false,jrEnabled:false,sharedControls:'unavailable'});
  expect(deploymentOrigin({VERCEL_PROJECT_PRODUCTION_URL:'train.vercel.app'})).toBe('https://train.vercel.app');expect(deploymentOrigin({APP_ORIGIN:'http://unsafe.example'})).toBeNull();
 });
 it('uses authenticated POST Redis commands and hides transport credentials/errors',async()=>{
  const fetcher=vi.fn(async(_url:URL,options:any)=>{expect(options.headers.Authorization).toBe('Bearer private-token');expect(JSON.parse(options.body)).toEqual(['PING']);return{ok:true,json:async()=>({result:'PONG'})};});
  expect(await createRedis({KV_REST_API_URL:'https://redis.example',KV_REST_API_TOKEN:'private-token'},fetcher).command('PING')).toBe('PONG');
  const redis=createRedis({UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'private-token'},async()=>{throw Error('private-token');});await expect(redis.command('GET','x')).rejects.toThrow('共有キャッシュ');expect(()=>createRedis({UPSTASH_REDIS_REST_URL:'http://redis.example',UPSTASH_REDIS_REST_TOKEN:'x'})).toThrow('HTTPS');
 });
 async function request(handler:any,{url='/api/config',method='GET',headers={},body,stream}:any={}){const req:any=Readable.from(stream?[Buffer.from(stream)]:[]);Object.assign(req,{url,method,headers:{host:'train.example',...headers},...(body!==undefined?{body}:{})});const res:any={statusCode:0,headers:{},text:'',setHeader(k:string,v:string){this.headers[k]=v;},end(text:string){this.text=text;}};await handler(req,res);return{status:res.statusCode,headers:res.headers,data:JSON.parse(res.text)};}
 it('serves rewritten/direct GET paths and validates malformed dates and methods',async()=>{
  const service={getConfig:async()=>({enabled:true}),getJrTimetables:vi.fn(async(date:string)=>({date})),route:vi.fn()},handler=createServerlessHandler(async()=>service);
  expect((await request(handler,{url:'/api?__path=config'})).data).toEqual({enabled:true});expect((await request(handler,{url:'/api/jr?date=2026-10-22'})).data.date).toBe(day);expect((await request(handler,{url:'/api/jr?date=bad'})).status).toBe(400);expect((await request(handler,{url:'/api/walking'})).status).toBe(405);expect((await request(handler,{url:'/api?__path=https://other'})).status).toBe(404);
 });
 it('handles Vercel parsed bodies and native streams and rejects cross-origin/oversize/malformed JSON',async()=>{
  const route=vi.fn(async(value:any)=>value),handler=createServerlessHandler(async()=>({route}));const headers={'content-type':'application/json',origin:'https://train.example'};
  expect((await request(handler,{url:'/api?__path=walking',method:'POST',headers,body:{origin}})).data.origin).toEqual(origin);
  expect((await request(handler,{url:'/api/walking',method:'POST',headers,stream:JSON.stringify({origin})})).data.origin).toEqual(origin);
  expect((await request(handler,{url:'/api/walking',method:'POST',headers:{...headers,origin:'https://other.example'},body:{}})).status).toBe(403);
  expect((await request(handler,{url:'/api/walking',method:'POST',headers,body:'x'.repeat(2050)})).status).toBe(413);
  expect((await request(handler,{url:'/api/walking',method:'POST',headers,body:'{broken'})).status).toBe(400);
  expect((await request(handler,{url:'/api/walking',method:'POST',body:{}})).status).toBe(415);expect(route).toHaveBeenCalledTimes(2);
 });
 it('suppresses unexpected internal errors, tokens and file paths',async()=>{
  const handler=createServerlessHandler(async()=>{throw Error('/var/task/.env private-token');});const response=await request(handler);expect(response.status).toBe(503);expect(JSON.stringify(response)).not.toContain('private-token');expect(response.headers['Cache-Control']).toBe('no-store');
 });
});

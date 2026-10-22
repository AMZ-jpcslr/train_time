import {afterEach,describe,expect,it,vi} from 'vitest';
// @ts-expect-error Shared Node service.
import {createWalkingService,parseWalkingResponse,MAX_PENDING_ROUTES,MAX_WALKING_RESPONSE_BYTES,MAX_GEOMETRY_POINTS,MAX_WALKING_STEPS} from '../server/walking-service.mjs';

const origin={lat:35,lon:135},entrance={id:'e',stationId:'s',lat:35.001,lon:135};
const request=(offset=0)=>({origin:{lat:35+offset/1000000,lon:135},stationId:'s',entranceId:'e'});
function fixture():any{return{code:'Ok',routes:[{distance:130,duration:104,geometry:{type:'LineString',coordinates:[[135,35],[135,35.001]]},legs:[{steps:[{mode:'walking',distance:130,name:'歩道',maneuver:{type:'depart'}}]}]}],waypoints:[{location:[135,35],distance:0},{location:[135,35.001],distance:0}]};}
function setup(fetchImpl:any,extra:Record<string,unknown>={}){
 let now=100000;
 return{service:createWalkingService({fetchImpl,clock:()=>now,wait:async(ms:number)=>{now+=ms;},entrances:[entrance],contactEmail:'test@example.test',...extra}),advance:(ms:number)=>{now+=ms;}};
}
afterEach(()=>vi.useRealTimers());

describe('walking API resource bounds (injected responses, no external requests)',()=>{
 it('bounds distinct pending requests, keeps duplicates coalesced, and frees slots after completion',async()=>{
  let unlock!:()=>void,start!:()=>void;
  const hold=new Promise<void>(resolve=>{unlock=resolve;}),entered=new Promise<void>(resolve=>{start=resolve;});
  const fetcher=vi.fn(async()=>{start();await hold;return Response.json(fixture());});
  const {service}=setup(fetcher),pending=Array.from({length:MAX_PENDING_ROUTES},(_,i)=>service.route(request(i)));
  await entered;
  const duplicate=service.route(request());
  const rejected=await Promise.all(Array.from({length:1000-MAX_PENDING_ROUTES},(_,i)=>service.route(request(i+MAX_PENDING_ROUTES)).then(()=>false,()=>true)));
  expect(rejected.every(Boolean)).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
  unlock();const results=await Promise.all([...pending,duplicate]);expect(results).toHaveLength(MAX_PENDING_ROUTES+1);expect(fetcher).toHaveBeenCalledTimes(MAX_PENDING_ROUTES);
  await service.route(request(20));expect(fetcher).toHaveBeenCalledTimes(MAX_PENDING_ROUTES+1);
 });

 it('cancels declared oversized responses before parsing and releases the shared lease',async()=>{
  const cancel=vi.fn(),release=vi.fn(async()=>{});
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array([123]));},cancel});
  const {service}=setup(async()=>new Response(stream,{headers:{'Content-Length':String(MAX_WALKING_RESPONSE_BYTES+1)}}),{gate:{acquire:async()=>release}});
  await expect(service.route(request())).rejects.toThrow('大きすぎる');expect(cancel).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);
 });

 it.each([undefined,'10'])('cancels oversized chunked data even with a missing or false Content-Length (%s)',async(length)=>{
  const cancel=vi.fn();let chunks=0;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(chunks++===0?MAX_WALKING_RESPONSE_BYTES:1));},cancel});
  const {service}=setup(async()=>new Response(stream,{headers:length?{'Content-Length':length}:{}}));
  await expect(service.route(request())).rejects.toThrow('大きすぎる');expect(cancel).toHaveBeenCalledTimes(1);expect(chunks).toBeLessThan(5);
 });

 it('accepts UTF-8 JSON exactly at the byte cap',async()=>{
  const value=JSON.stringify(fixture()),body=value+' '.repeat(MAX_WALKING_RESPONSE_BYTES-Buffer.byteLength(value));
  expect(Buffer.byteLength(body)).toBe(MAX_WALKING_RESPONSE_BYTES);
  const {service}=setup(async()=>new Response(body));expect((await service.route(request())).roadDistanceMeters).toBe(130);
 });

 it('also bounds parsed JSON from a custom fetch adapter',async()=>{
  const {service}=setup(async()=>({ok:true,json:async()=>({...fixture(),padding:'x'.repeat(MAX_WALKING_RESPONSE_BYTES)})}));
  await expect(service.route(request())).rejects.toThrow('大きすぎる');
 });

 it('cancels unread provider error bodies before applying provider backoff',async()=>{
  const cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({cancel});
  const {service}=setup(async()=>new Response(stream,{status:429}));
  await expect(service.route(request())).rejects.toThrow('429');expect(cancel).toHaveBeenCalledTimes(1);
 });

 it('rejects oversized geometry and steps before copying them to a cache result',()=>{
  const shape=fixture();shape.routes[0].geometry.coordinates=Array.from({length:MAX_GEOMETRY_POINTS+1},()=>[135,35]);
  expect(()=>parseWalkingResponse(shape,origin,entrance)).toThrow('形状');
  const steps=fixture();steps.routes[0].legs[0].steps=Array.from({length:MAX_WALKING_STEPS+1},()=>({mode:'walking',distance:1}));
  expect(()=>parseWalkingResponse(steps,origin,entrance)).toThrow('徒歩だけ');
 });

 it.each([
  (value:any)=>{value.routes[0].legs[0].steps[0].name={unexpected:'object'};},
  (value:any)=>{value.routes[0].legs[0].steps[0].name='x'.repeat(513);},
  (value:any)=>{value.routes[0].legs[0].steps[0].distance=Infinity;},
  (value:any)=>{value.routes[0].legs[0].steps[0].maneuver.type=['turn'];},
  (value:any)=>{value.data_version={unexpected:'object'};},
 ])('rejects malformed provider text and numerical fields',change=>{
  const value=fixture();change(value);expect(()=>parseWalkingResponse(value,origin,entrance)).toThrow('案内情報');
 });

 it('expires cached GPS routes after ten minutes without requiring another request',async()=>{
  vi.useFakeTimers();const fetcher=vi.fn(async()=>Response.json(fixture())),{service}=setup(fetcher);
  await service.route(request());expect((await service.route(request())).cached).toBe(true);
  // The injected wall clock does not advance: only the cleanup timer can remove this entry.
  await vi.advanceTimersByTimeAsync(600000);
  expect((await service.route(request())).cached).toBe(false);expect(fetcher).toHaveBeenCalledTimes(2);
 });

 it('drops expired or future-dated cache entries when the wall clock changes',async()=>{
  const fetcher=vi.fn(async()=>Response.json(fixture())),{service,advance}=setup(fetcher);
  await service.route(request());advance(600001);expect((await service.route(request())).cached).toBe(false);
  advance(-600001);expect((await service.route(request())).cached).toBe(false);expect(fetcher).toHaveBeenCalledTimes(3);
 });

 it('bounds cached route bytes as well as the number of entries',async()=>{
  const value=fixture();value.routes[0].geometry.coordinates=Array.from({length:MAX_GEOMETRY_POINTS},(_,i)=>[135,35+i*.001/(MAX_GEOMETRY_POINTS-1)]);
  value.routes[0].legs[0].steps=Array.from({length:MAX_WALKING_STEPS},()=>({mode:'walking',distance:.065,name:'x'.repeat(512)}));
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(MAX_WALKING_RESPONSE_BYTES);
  const fetcher=vi.fn(async()=>Response.json(value)),{service}=setup(fetcher);
  for(let i=0;i<8;i++)await service.route(request(i));
  expect((await service.route(request())).cached).toBe(false);expect(fetcher).toHaveBeenCalledTimes(9);
 });
});

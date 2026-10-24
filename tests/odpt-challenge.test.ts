import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
// @ts-expect-error Native server module
import {createOdptTokenReader} from '../server/odpt-token.mjs';
// @ts-expect-error Native server module
import {challengeProviders} from '../server/odpt-challenge-providers.mjs';
// @ts-expect-error Native server module
import {normalizeChallenge,challengeDayTables} from '../server/odpt-challenge-normalize.mjs';
// @ts-expect-error Native server module
import {createChallengeService} from '../server/odpt-challenge-service.mjs';
// @ts-expect-error Native server module
import {createApiHandler} from '../server/api.mjs';
import {validChallengeCatalog} from '../src/useChallengeCatalog';
import {validStationTables} from '../src/useStationTimetables';
import {departureKey} from '../src/useTrainSelection';
import {widgetDepartureId} from '../src/domain/widget';

const provider=challengeProviders[0],token='fictional_token_for_security_tests_12345';
const now=Date.parse('2026-10-24T14:00:00+09:00');
const station='odpt.Station:JR-East.Test.Alpha',destination='odpt.Station:JR-East.Test.Beta',railway='odpt.Railway:JR-East.Test',direction='odpt.RailDirection:Outbound';
/** Entirely fictional ODPT rows; no restricted acquired facts or credentials are fixtures. */
function source(){
 return {
  Station:[{'owl:sameAs':station,'dc:title':'架空甲駅','geo:lat':35.1,'geo:long':139.1,'odpt:stationCode':'TEST1','odpt:stationTitle':{ja:'架空甲駅',en:'Fictional Alpha'}},
   {'owl:sameAs':destination,'dc:title':'架空乙駅','geo:lat':35.2,'geo:long':139.2}],
  Railway:[{'owl:sameAs':railway,'dc:title':'架空テスト線'}],
  RailDirection:[{'owl:sameAs':direction,'dc:title':'架空乙'}],
  TrainType:[{'owl:sameAs':'odpt.TrainType:JR-East.Local','dc:title':'普通'}],
  StationTimetable:['Weekday','SaturdayHoliday'].map((calendar,i)=>({'owl:sameAs':'test-'+calendar,'odpt:operator':provider.operator,'odpt:station':station,'odpt:railway':railway,'odpt:railDirection':direction,'odpt:calendar':'odpt.Calendar:'+calendar,
   'odpt:stationTimetableObject':[{'odpt:departureTime':i?'14:06:30':'14:05','odpt:destinationStation':[destination],'odpt:trainType':'odpt.TrainType:JR-East.Local'},
    {'odpt:departureTime':'00:12','odpt:destinationStation':[destination]}]})),
 };
}
describe('private ODPT credential handling',()=>{
 it('uses server variables without launching a child and never reads Windows credentials in cloud mode',async()=>{
  const execute=vi.fn();
  expect(await createOdptTokenReader({ODPT_CHALLENGE_TOKEN:token},{execute})()).toBe(token);
  expect(await createOdptTokenReader({},{local:false,platform:'win32',execute})()).toBeNull();expect(execute).not.toHaveBeenCalled();
 });
 it('reads encrypted credentials through a pipe without putting the token in process arguments',async()=>{
  const execute=vi.fn(async()=>({stdout:token})),reader=createOdptTokenReader({},{local:true,platform:'win32',execute});
  expect(await reader()).toBe(token);expect(await reader()).toBe(token);expect(execute).toHaveBeenCalledOnce();
  expect(JSON.stringify(execute.mock.calls)).not.toContain(token);
 });
 it('never forwards errors containing credentials from a failed credential reader',async()=>{
  const reader=createOdptTokenReader({},{local:true,platform:'win32',execute:async()=>{throw Error(token);}});
  expect(await reader()).toBeNull();
 });
});
describe('ODPT station timetable conversion',()=>{
 it('keeps source departures and seconds, converts post-midnight service time, and validates client output',()=>{
  const data=normalizeChallenge(provider,source(),new Date(now).toISOString());
  expect(data.coverage.audit).toMatchObject({sourceDepartures:4,importedDepartures:4,unknownDestinations:0});
  expect(data.stations).toHaveLength(1);expect(validChallengeCatalog({stations:data.stations,coverage:data.coverage},provider.id)).toBe(true);
  const s=data.stations[0],sat=challengeDayTables(data,s.id,'2026-10-24',now),weekday=challengeDayTables(data,s.id,'2026-10-23',now);
  expect(sat[0].departures.map((d:any)=>d.time)).toEqual(['14:06:30','24:12']);expect(weekday[0].departures[0].time).toBe('14:05');
  expect(challengeDayTables(data,s.id,'2026-11-03',now)[0].departures[0].time).toBe('14:06:30');
  expect(validStationTables(sat,s)).toBe(true);expect(JSON.stringify(data)).not.toContain(token);
 });
 it('rejects unsupported special days, invalid dates, dates after the challenge, and ambiguous calendars',()=>{
  const data=normalizeChallenge(provider,source(),new Date(now).toISOString()),s=data.stations[0];
  expect(()=>challengeDayTables(data,s.id,'2026-12-31',Date.parse('2026-12-30T00:00:00Z'))).toThrow('年末年始');
  expect(()=>challengeDayTables(data,s.id,'2027-03-13',now)).toThrow();expect(()=>challengeDayTables(data,s.id,'2026-02-31',now)).toThrow();
  data.tables[s.id].push({...data.tables[s.id][1],id:'duplicate'});expect(()=>challengeDayTables(data,s.id,'2026-10-24',now)).toThrow('重複');
 });
 it('uses explicit event dates ahead of the ordinary calendar and refuses an unconfirmed event calendar',()=>{
  const rows=source() as any,ref='odpt.Calendar:Specific.Test.Event';
  rows.Calendar=[{'owl:sameAs':ref,'odpt:day':['2026-10-24'],'odpt:duration':'2026-10-01/2026-11-30'}];
  rows.StationTimetable.push({...rows.StationTimetable[1],'owl:sameAs':'test-event','odpt:calendar':ref,'odpt:stationTimetableObject':[{'odpt:departureTime':'15:23','odpt:destinationStation':[destination]}]});
  const data=normalizeChallenge(provider,rows,new Date(now).toISOString()),s=data.stations[0];
  expect(challengeDayTables(data,s.id,'2026-10-24',now)[0].departures.map((d:any)=>d.time)).toEqual(['15:23']);
  expect(challengeDayTables(data,s.id,'2026-10-25',now)[0].departures[0].time).toBe('14:06:30');
  expect(data.coverage.audit.unsupportedCalendars).toBe(0);
  rows.Calendar=[];expect(()=>normalizeChallenge(provider,rows,new Date(now).toISOString())).toThrow('特別運行日');
 });
 it('preserves simultaneous trains by official train number and resolves shared stations only through an explicit timetable link',()=>{
  const rows=source(),first=rows.StationTimetable[0]['odpt:stationTimetableObject'][0] as any;
  first['odpt:trainNumber']='1001';rows.StationTimetable[0]['odpt:stationTimetableObject'].push({...first,'odpt:trainNumber':'1002'});
  const raw=rows.StationTimetable[0];raw['odpt:station']='odpt.Station:OtherLine.Shared';
  (rows.Station[0] as any)['odpt:stationTimetable']=[raw['owl:sameAs']];
  const value=normalizeChallenge(provider,rows,new Date(now).toISOString());
  const departures=(Object.values(value.tables).flat() as any[]).find(t=>t.dayType==='weekday').departures;
  expect(departures.slice(0,2).map((d:any)=>d.trainNumber)).toEqual(['1001','1002']);
  const a={...departures[0],epoch:now+1000},b={...departures[1],epoch:now+1000};
  expect(departureKey(a)).not.toBe(departureKey(b));expect(widgetDepartureId(a)).toBe(departureKey(a));
  delete (rows.Station[0] as any)['odpt:stationTimetable'];expect(()=>normalizeChallenge(provider,rows,new Date(now).toISOString())).toThrow('参照');
 });
 it('does not invent names or accept a mismatched operator, duplicate departure, wrong reference, or malformed time',()=>{
  const unknown=source();unknown.StationTimetable[0]['odpt:stationTimetableObject'][0]['odpt:destinationStation']=['odpt.Station:Unknown'];
  expect(normalizeChallenge(provider,unknown,new Date(now).toISOString()).coverage.audit.unknownDestinations).toBe(1);
  for(const mutate of [
   (d:any)=>d.StationTimetable[0]['odpt:operator']='other',
   (d:any)=>d.StationTimetable[0]['odpt:station']='missing',
   (d:any)=>d.StationTimetable[0]['odpt:stationTimetableObject'][0]['odpt:departureTime']='99:00',
   (d:any)=>d.StationTimetable[0]['odpt:stationTimetableObject'].push(d.StationTimetable[0]['odpt:stationTimetableObject'][0]),
  ]){const d=source();mutate(d);expect(()=>normalizeChallenge(provider,d,new Date(now).toISOString())).toThrow();}
 });
 it('rejects catalogs with external paths, wrong provider, invalid coordinates and duplicate station IDs',()=>{
  const data=normalizeChallenge(provider,source(),new Date(now).toISOString()),value={stations:data.stations,coverage:data.coverage};
  for(const changes of [{timetablePath:'https://evil.example/'},{challengeProvider:'tokyu'},{lat:NaN}])expect(validChallengeCatalog({...value,stations:[{...data.stations[0],...changes}]},provider.id)).toBe(false);
  expect(validChallengeCatalog({...value,stations:[...data.stations,...data.stations]},provider.id)).toBe(false);
 });
});
describe('ODPT acquisition and secret boundary',()=>{
 it('partitions a capped response by official railway and resolves explicitly referenced destinations in bounded batches',async()=>{
  const rows=source(),refs:string[]=[];
  const fetchImpl=vi.fn(async(url:URL)=>{
   const type=url.pathname.split(':').at(-1)! as keyof ReturnType<typeof source>;
   if(type==='StationTimetable'&&!url.searchParams.has('odpt:railway'))return Response.json(Array.from({length:1000},()=>rows.StationTimetable[0]));
   if(type==='Station'&&fetchImpl.mock.calls.filter(([u])=>u.pathname.endsWith(':Station')).length>1){refs.push(url.searchParams.get('odpt:operator')!);return Response.json([rows.Station[1]]);}
   return Response.json(type==='Station'?[rows.Station[0]]:rows[type]);
  });
  const cacheDir=pathToFileURL((await mkdtemp(join(tmpdir(),'odpt-partition-test-')))+ '/');
  const value=await createChallengeService({local:true,cacheDir,tokenReader:async()=>token,fetchImpl,clock:()=>now,delay:async()=>{}}).catalog(provider.id);
  expect(value.coverage.audit.sourceTables).toBe(2);expect(value.coverage.audit.unknownDestinations).toBe(0);expect(refs).toEqual([provider.operator]);
  expect(fetchImpl.mock.calls.some(([url])=>url.searchParams.get('odpt:railway')===railway)).toBe(true);
 });
 it('shares compressed cache between cloud instances, keeps credentials out of Redis, and expires safely',async()=>{
  let time=now;const values=new Map<string,{value:string;until:number}>(),commands:any[]=[];
  const get=(key:string)=>{const v=values.get(key);if(v&&v.until>time)return v.value;values.delete(key);return null;};
  const redis={command:async(...args:any[])=>{
   commands.push(args);const [cmd,key,value,...rest]=args;
   if(cmd==='GET')return get(key);
   if(cmd==='SET'){if(rest.includes('NX')&&get(key))return null;values.set(key,{value,until:time+Number(rest[rest.indexOf('PX')+1])});return 'OK';}
   if(cmd==='EVAL'){const lock=args[3],owner=args[4];if(get(lock)===owner){values.delete(lock);return 1;}return 0;}
   throw Error('Unexpected test command');
  }};
  const fetchImpl=vi.fn(async(url:URL)=>Response.json(source()[url.pathname.split(':').at(-1)! as keyof ReturnType<typeof source>]));
  const options={redis,tokenReader:async()=>token,fetchImpl,clock:()=>time,delay:async(ms:number)=>{time+=ms;}};
  const first=await createChallengeService(options).catalog(provider.id),second=await createChallengeService(options).catalog(provider.id);
  expect(second).toEqual(first);expect(fetchImpl).toHaveBeenCalledTimes(5);expect(JSON.stringify(commands)).not.toContain(token);
  time+=6*3600000+1;await createChallengeService(options).catalog(provider.id);expect(fetchImpl).toHaveBeenCalledTimes(10);
 });
 it('deduplicates concurrent acquisition, privately caches it, and returns no token or upstream URL',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'maniau-odpt-test-')),cacheDir=pathToFileURL(directory+'/'),calls:URL[]=[];
  const fetchImpl=vi.fn(async(url:URL)=>{calls.push(url);return Response.json(source()[url.pathname.split(':').at(-1)! as keyof ReturnType<typeof source>]);});
  const options={local:true,tokenReader:async()=>token,cacheDir,fetchImpl,clock:()=>now,delay:async()=>{}};
  const service=createChallengeService(options);const [a,b]=await Promise.all([service.catalog(provider.id),service.catalog(provider.id)]);
  expect(a).toEqual(b);expect(fetchImpl).toHaveBeenCalledTimes(5);expect(calls.every(u=>u.origin==='https://api-challenge.odpt.org'&&u.searchParams.get('acl:consumerKey')===token)).toBe(true);
  expect(JSON.stringify(a)).not.toContain(token);expect(JSON.stringify(await service.status())).not.toContain(token);
  const fresh=createChallengeService(options);expect(await fresh.catalog(provider.id)).toEqual(a);expect(fetchImpl).toHaveBeenCalledTimes(5);
  for(const name of await readdir(directory))expect((await readFile(join(directory,name))).includes(Buffer.from(token))).toBe(false);
  expect(await service.timetable(a.stations[0].id,'2026-10-24')).toHaveLength(1);
 });
 it('fails closed for missing token, missing shared cache, challenge end, redirect/HTTP failure and unsafe provider',async()=>{
  const fetchImpl=vi.fn(async()=>{throw Error('https://api-challenge.odpt.org/?acl:consumerKey='+token);});
  const missing=createChallengeService({fetchImpl,tokenReader:async()=>null,local:true});await expect(missing.catalog(provider.id)).rejects.toThrow('未設定');
  const cloud=createChallengeService({fetchImpl,tokenReader:async()=>token,clock:()=>now});expect((await cloud.status()).enabled).toBe(false);
  const endedDirectory=await mkdtemp(join(tmpdir(),'maniau-odpt-ended-'));
  const ended=createChallengeService({fetchImpl,local:true,cacheDir:pathToFileURL(endedDirectory+'/'),tokenReader:async()=>token,clock:()=>Date.parse('2027-03-13T00:00:00+09:00')});expect((await ended.status()).enabled).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
  const directory=await mkdtemp(join(tmpdir(),'maniau-odpt-failure-'));
  const service=createChallengeService({fetchImpl,local:true,tokenReader:async()=>token,clock:()=>now,cacheDir:pathToFileURL(directory+'/'),delay:async()=>{}});
  await expect(service.catalog('https://evil.example')).rejects.toThrow('事業者');
  await expect(service.catalog(provider.id)).rejects.not.toThrow(token);await expect(service.catalog(provider.id)).rejects.toThrow('15分');expect(fetchImpl).toHaveBeenCalledOnce();
 });
 it('rejects cross-site API requests and does not accept token, raw URL or resource parameters',async()=>{
  const catalog=vi.fn(async()=>({stations:[]})),handler=createApiHandler({getServices:async()=>({odpt:{catalog},getConfig:async()=>({})})});
  const call=async(url:string,headers:Record<string,string>)=>{let body='';const res={statusCode:200,setHeader:vi.fn(),end:(v:string)=>{body=v;}};await handler({method:'GET',url,headers:{host:'127.0.0.1:5173',...headers}},res);return {status:res.statusCode,body};};
  expect((await call('/api/odpt/catalog?provider=jr-east',{'sec-fetch-site':'cross-site'})).status).toBe(403);expect(catalog).not.toHaveBeenCalled();
  expect((await call('/api/odpt/raw?url=https://evil.example',{})).status).toBe(404);
  expect((await call('/api/odpt/catalog?provider=jr-east&token=should-not-be-accepted',{})).status).toBe(400);
 });
});

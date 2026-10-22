import {mkdir,writeFile} from 'node:fs/promises';
const record={checkedAt:new Date().toISOString(),application:null,routing:null,jr:[],privateFiles:[]};
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const app=await fetch('http://127.0.0.1:4173/');
assert(app.ok,'Preview unavailable');record.application={status:app.status};
const config=await(await fetch('http://127.0.0.1:4173/api/config')).json();
assert(config.enabled&&config.contactEmail,'Walking provider contact is not configured');
record.routing={enabled:config.enabled,provider:config.provider,contactConfigured:!!config.contactEmail};
for(const date of ['2026-10-22','2026-10-23','2026-10-24','2026-10-25']){
 const result=await(await fetch('http://127.0.0.1:4173/api/jr?date='+date)).json();
 assert(result.schemaVersion===2&&result.status==='ready'&&result.tables.length===8,'JR date fetch failed: '+date);
 const west=result.tables.find(t=>t.stationId==='jr-osaka'&&t.directionId==='west');
 assert(!west.departures.some(d=>/宝塚|新三田/.test(d.destination)),'Out-of-scope Osaka departures');
 record.jr.push({date,status:result.status,schemaVersion:result.schemaVersion,tables:result.tables.length,departures:result.tables.reduce((n,t)=>n+t.departures.length,0),osakaWest:west.departures.length,expiresAt:result.expiresAt,source:result.source});
}
await mkdir('.cache/verification',{recursive:true});
await writeFile('.cache/verification/watch-probe.json',JSON.stringify({checkedAt:record.checkedAt}));
for(const path of ['/.env.local','/.cache/verification/watch-probe.json']){
 const response=await fetch('http://127.0.0.1:5173'+path);
 assert(response.status===403,'Private file is not denied: '+path);
 record.privateFiles.push({path,status:response.status});
}
const dev=await fetch('http://127.0.0.1:5173/');assert(dev.ok,'Development server stopped after cache write');
record.developmentServer={status:dev.status,cacheWriteHealthy:true};
await writeFile('docs/local-runtime-validation.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));

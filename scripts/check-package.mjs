// Reproduce the Node dependency trace used for serverless packaging, without
// credentials, a Vercel project link, or a deployment.
import {nodeFileTrace} from '@vercel/nft';
import {mkdir,copyFile,writeFile,mkdtemp,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
// An explicit normalized predicate works on both Windows and Linux; backslashes
// in Windows glob paths otherwise risk tracing the local source cache.
const ignore=file=>/^(?:\.cache|\.git|\.vercel|docs|tests|test-results|playwright-report|dist)(?:\/|$)|^\.env(?:\.|$)/.test(file.replaceAll('\\','/'));
const trace=await nodeFileTrace(['api/index.mjs'],{base:root,processCwd:root,ignore});
if(trace.warnings.size)throw Error('Unresolved runtime dependencies: '+[...trace.warnings].map(w=>w.message).join('\n'));
const files=[...trace.fileList].map(f=>f.replaceAll('\\','/'));
for(const required of ['api/index.mjs','src/data/entrances.json','scripts/import-jr.mjs','server/redis.mjs'])if(!files.includes(required))throw Error('Runtime file missing from trace: '+required);
if(files.some(f=>/^(?:\.cache|\.git|\.env|docs|tests|test-results)(?:[/.]|$)/.test(f)))throw Error('Private or test material included in runtime trace');
const stage=await mkdtemp(path.join(tmpdir(),'maniau-function-'));
let bytes=0;
for(const file of files){const source=path.join(root,file),target=path.join(stage,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target);bytes+=(await stat(source)).size;}
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(?:ODPT_|UPSTASH_|KV_REST_|ROUTING_|APP_ORIGIN$|VERCEL_|VERCEL$)/.test(key)));
// Import only the traced bundle, from an unrelated /tmp-style directory.
// Missing deployment settings must fail closed rather than contact providers.
const smoke=spawnSync(process.execPath,['--input-type=module','-e',`const {default:handler}=await import('./api/index.mjs'); if(typeof handler!=='function')throw Error('Missing serverless handler'); const headers={}; const req={method:'GET',url:'/api/config',headers:{host:'test.vercel.app'}}; let body; const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(value){body=value;}}; await handler(req,res); const config=JSON.parse(body); if(res.statusCode!==200||config.enabled!==false)throw Error('Missing cloud config must disable external routing'); console.log(JSON.stringify({handlerLoaded:true,unconfiguredRoutingDisabled:true,status:res.statusCode}));`],{cwd:stage,encoding:'utf8',env:{...env,VERCEL:'1',VERCEL_URL:'test.vercel.app'}});
if(smoke.status!==0)throw Error('Traced function smoke failed: '+smoke.stderr+smoke.stdout);
const report={checkedAt:new Date().toISOString(),runtimeFiles:files.length,runtimeBytes:bytes,privateFilesExcluded:true,smoke:JSON.parse(smoke.stdout.trim()),files};
await mkdir('.cache/verification',{recursive:true});await writeFile('.cache/verification/serverless-package.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,files:undefined},null,2));

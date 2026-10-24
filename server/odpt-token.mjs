import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile);
const valid=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{20,256}$/.test(value);
/** Never return credentials through an API, log, URL in an error, or client bundle. */
export function createOdptTokenReader(env,{local=false,platform=process.platform,execute=run}={}){
 let pending;
 return async()=>{
  if(valid(env.ODPT_CHALLENGE_TOKEN))return env.ODPT_CHALLENGE_TOKEN;
  if(!local||platform!=='win32')return null;
  return pending??=execute('pwsh.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('../scripts/odpt-token.ps1',import.meta.url)),'-Read'],{windowsHide:true,maxBuffer:4096,timeout:10000})
   .then(({stdout})=>valid(stdout.trim())?stdout.trim():null).catch(()=>{pending=undefined;return null;});
 };
}

// Local, single-use credential entry. No token ever goes through a command argument or log.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {windowsPowerShell} from '../server/windows-powershell.mjs';
const saveMessages={
 runtime:'暗号化用のPowerShellを起動できませんでした。設定画面を開き直してください。',
 timeout:'暗号化処理が時間内に完了しませんでした。もう一度保存してください。',
 directory:'暗号化ファイルの保存先を準備できませんでした。保存先フォルダーのアクセス権を確認します。',
 encryption:'Windowsの暗号化処理に失敗しました。Windowsユーザーの暗号化機能を確認します。',
 write:'暗号化ファイルを書き込めませんでした。保存先フォルダーのアクセス権と空き容量を確認します。',
 unknown:'暗号化して保存できませんでした。設定処理を確認します。',
};
const saveError=reason=>Object.assign(Error(saveMessages[reason]||saveMessages.unknown),{code:'ODPT_SAVE_'+reason.toUpperCase()});
const scriptNonce=randomBytes(18).toString('base64');
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'`,'Referrer-Policy':'no-referrer','Connection':'close'};
const page=message=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>まにあう — ODPTの非公開設定</title><style>body{font-family:system-ui;background:#101c20;color:#eef5ef;max-width:600px;margin:80px auto;padding:24px;line-height:1.9}input,button{box-sizing:border-box;width:100%;padding:14px;font-size:18px;margin:12px 0}button{background:#d5ec93;border:0;border-radius:8px;cursor:pointer}small{color:#bac9bc}</style><h1>ODPTトークンの非公開設定</h1>${message}</html>`;
export async function saveEncryptedToken(token,{storageDirectory,kind='challenge2026'}={}){
 if(!['challenge2026','standard'].includes(kind))throw Error('Invalid credential type');
 if(!windowsPowerShell)throw saveError('runtime');
 await new Promise((resolve,reject)=>{
  const child=spawn(windowsPowerShell,['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./odpt-token.ps1',import.meta.url)),'-SaveStdin',...(storageDirectory?['-StorageDirectory',storageDirectory]:[]),...(kind==='standard'?['-CredentialName','standard']:[])],{windowsHide:true,timeout:15000,stdio:['pipe','ignore','ignore']});
  child.on('error',()=>reject(saveError('runtime')));child.on('exit',(code,signal)=>code===0?resolve():reject(saveError(signal?'timeout':({31:'directory',32:'encryption',33:'write'}[code]||'unknown'))));child.stdin.on('error',()=>{});child.stdin.end(token);
 });
}
export async function startTokenSetup({port=0,pathname='/setup/'+randomBytes(24).toString('hex'),saveToken=saveEncryptedToken,onSaved=()=>{},onSaveError=()=>{},clock=Date.now,kind='challenge2026'}={}){
if(!['challenge2026','standard'].includes(kind))throw Error('Invalid credential type');
if(!/^\/setup\/[a-f0-9]{48}$/.test(pathname))throw Error('Invalid setup URL');
let origin,saving=false,used=false;const until=clock()+15*60000;
const server=createServer(async(req,res)=>{
 const send=(code,body)=>{const json=req.headers.accept?.includes('application/json');res.writeHead(code,{...headers,...(json?{'Content-Type':'application/json; charset=utf-8'}:{})});res.end(json?JSON.stringify({ok:code===200,message:body.replace(/<[^>]*>/g,' ')}):page(body));};
 if(req.headers.host!==new URL(origin).host||req.url!==pathname)return send(404,'<p>ページがありません。</p>');
 if(clock()>until)return send(410,'<p>入力ページの期限が切れました。もう一度セットアップを開始してください。</p>');
 if(used||saving)return send(409,'<p>保存処理は実行済み、または実行中です。</p>');
 if(req.method==='GET')return send(200,`<p>${kind==='standard'?'京都市営地下鉄GTFS取得用：通常版ODPT（api.odpt.org）':'チャレンジ2026専用'}アクセストークンを入力してください。</p><form method="post" action="${pathname}" autocomplete="off"><label for="token">アクセストークン（入力は伏せ字）</label><input id="token" name="token" type="password" required maxlength="256" autocomplete="off" autofocus><button>暗号化してこのPCに保存</button></form><p id="result" role="status"></p><small>送信先はこのPCの127.0.0.1だけです。Windowsのユーザーアカウントにひも付けて暗号化し、Git管理対象外に保存します。</small><script nonce="${scriptNonce}">document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),result=document.getElementById('result');button.disabled=true;result.textContent='暗号化して保存しています…';try{const response=await fetch(form.action,{method:'POST',headers:{Accept:'application/json'},body:new URLSearchParams(new FormData(form)),referrerPolicy:'no-referrer'}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'保存できませんでした。');form.reset();form.remove();const heading=document.createElement('h2');heading.textContent='暗号化して保存しました';result.before(heading);result.textContent='このタブを閉じて構いません。接続確認を進めます。';}catch(error){button.disabled=false;result.textContent=error instanceof TypeError?'PCの保存サーバーに接続できませんでした。新しく開いた設定画面で再試行してください。':error.message;}});</script>`);
 // The unpredictable 192-bit path is the CSRF capability, and never leaves this
 // page via Referer. Browsers can legitimately send Origin:null under no-referrer.
 const sender=req.headers.origin;
 if(req.method!=='POST'||sender&&sender!=='null'&&sender!==origin||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return send(403,'<p>このページから入力してください。</p>');
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024)return send(413,'<p>入力が長すぎます。</p>');}
 const token=new URLSearchParams(raw).get('token')?.trim();raw='';
 if(!token||!/^[a-zA-Z0-9_-]{20,256}$/.test(token))return send(400,'<p>入力形式を確認し、前のページへ戻って入力してください。</p>');
 saving=true;
 try{
  if(kind==='standard')await saveToken(token,{kind});else await saveToken(token);used=true;
  send(200,'<h2>暗号化して保存しました</h2><p>このタブを閉じて構いません。アプリ側で接続確認を進めます。</p>');
  onSaved();server.close();
 }catch(error){const reason=Object.keys(saveMessages).find(reason=>error?.code==='ODPT_SAVE_'+reason.toUpperCase())||'unknown';send(500,'<p>'+saveMessages[reason]+'</p>');onSaveError('ODPT_SAVE_'+reason.toUpperCase());}finally{saving=false;}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
return {server,url:origin+pathname};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const kind=process.argv.includes('--standard')?'standard':'challenge2026',statusFile=kind==='standard'?'standard-setup-status.json':'setup-status.json';
 const previous=process.argv.includes('--resume')?JSON.parse(await readFile('.cache/odpt-credentials/'+statusFile,'utf8')):null;
 const result=await startTokenSetup({kind,...(previous?{port:Number(new URL(previous.url).port),pathname:new URL(previous.url).pathname}:{}),onSaved:()=>console.log('Encrypted ODPT credential saved.'),onSaveError:code=>console.error(code)});
 await mkdir('.cache/odpt-credentials',{recursive:true});await writeFile('.cache/odpt-credentials/'+statusFile,JSON.stringify({url:result.url}));
 console.log('Private token entry: '+result.url);
}

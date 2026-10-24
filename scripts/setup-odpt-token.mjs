// Local, single-use credential entry. No token ever goes through a command argument or log.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','Connection':'close'};
const page=message=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>まにあう — ODPTの非公開設定</title><style>body{font-family:system-ui;background:#101c20;color:#eef5ef;max-width:600px;margin:80px auto;padding:24px;line-height:1.9}input,button{box-sizing:border-box;width:100%;padding:14px;font-size:18px;margin:12px 0}button{background:#d5ec93;border:0;border-radius:8px;cursor:pointer}small{color:#bac9bc}</style><h1>ODPTトークンの非公開設定</h1>${message}</html>`;
export async function saveEncryptedToken(token,{storageDirectory}={}){
 await new Promise((resolve,reject)=>{
  const child=spawn('pwsh.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./odpt-token.ps1',import.meta.url)),'-SaveStdin',...(storageDirectory?['-StorageDirectory',storageDirectory]:[])],{windowsHide:true,timeout:15000,stdio:['pipe','ignore','ignore']});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Could not save')));child.stdin.on('error',()=>{});child.stdin.end(token);
 });
}
export async function startTokenSetup({port=0,pathname='/setup/'+randomBytes(24).toString('hex'),saveToken=saveEncryptedToken,onSaved=()=>{},clock=Date.now}={}){
if(!/^\/setup\/[a-f0-9]{48}$/.test(pathname))throw Error('Invalid setup URL');
let origin,saving=false,used=false;const until=clock()+15*60000;
const server=createServer(async(req,res)=>{
 const send=(code,body)=>{res.writeHead(code,headers);res.end(page(body));};
 if(req.headers.host!==new URL(origin).host||req.url!==pathname)return send(404,'<p>ページがありません。</p>');
 if(clock()>until)return send(410,'<p>入力ページの期限が切れました。もう一度セットアップを開始してください。</p>');
 if(used||saving)return send(409,'<p>保存処理は実行済み、または実行中です。</p>');
 if(req.method==='GET')return send(200,`<p>チャレンジ2026専用アクセストークンを入力してください。</p><form method="post" action="${pathname}" autocomplete="off"><label for="token">アクセストークン（入力は伏せ字）</label><input id="token" name="token" type="password" required maxlength="256" autocomplete="off" autofocus><button>暗号化してこのPCに保存</button></form><small>送信先はこのPCの127.0.0.1だけです。Windowsのユーザーアカウントにひも付けて暗号化し、Git管理対象外に保存します。</small>`);
 // The unpredictable 192-bit path is the CSRF capability, and never leaves this
 // page via Referer. Browsers can legitimately send Origin:null under no-referrer.
 const sender=req.headers.origin;
 if(req.method!=='POST'||sender&&sender!=='null'&&sender!==origin||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return send(403,'<p>このページから入力してください。</p>');
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024)return send(413,'<p>入力が長すぎます。</p>');}
 const token=new URLSearchParams(raw).get('token')?.trim();raw='';
 if(!token||!/^[a-zA-Z0-9_-]{20,256}$/.test(token))return send(400,'<p>入力形式を確認し、前のページへ戻って入力してください。</p>');
 saving=true;
 try{
  await saveToken(token);used=true;
  send(200,'<h2>暗号化して保存しました</h2><p>このタブを閉じて構いません。アプリ側で接続確認を進めます。</p>');
  onSaved();server.close();
 }catch{send(500,'<p>保存できませんでした。Windowsアカウントの権限を確認してください。</p>');}finally{saving=false;}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
return {server,url:origin+pathname};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const previous=process.argv.includes('--resume')?JSON.parse(await readFile('.cache/odpt-credentials/setup-status.json','utf8')):null;
 const result=await startTokenSetup({...(previous?{port:Number(new URL(previous.url).port),pathname:new URL(previous.url).pathname}:{}),onSaved:()=>console.log('Encrypted ODPT credential saved.')});
 await mkdir('.cache/odpt-credentials',{recursive:true});await writeFile('.cache/odpt-credentials/setup-status.json',JSON.stringify({url:result.url}));
 console.log('Private token entry: '+result.url);
}

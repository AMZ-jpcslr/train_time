import {getJrTimetables} from './jr-service.mjs';
import {loadWalkingService} from './walking-service.mjs';
import {validDate} from '../scripts/import-jr.mjs';
import {createChallengeService} from './odpt-challenge-service.mjs';
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
async function jsonBody(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new RequestError(415,'JSON形式が必要です。');
 if(Number(req.headers['content-length'])>2048)throw new RequestError(413,'要求が大きすぎます。');
 let raw;
 if(req.body!==undefined){raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);}
 else{raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)throw new RequestError(413,'要求が大きすぎます。');}}
 if(typeof raw!=='string'||Buffer.byteLength(raw)>2048)throw new RequestError(413,'要求が大きすぎます。');
 try{return JSON.parse(raw);}catch{throw new RequestError(400,'JSONを読み取れませんでした。');}
}
export function createApiHandler({getServices,cloud=false}){
 return async(req,res,next=()=>{})=>{
  const url=new URL(req.url||'/','http://127.0.0.1');let pathname=url.pathname;
  if(cloud&&['/api','/api/'].includes(pathname)&&url.searchParams.has('__path'))pathname=`/api/${url.searchParams.get('__path')}`;
  function send(status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));}
  if(!pathname.startsWith('/api/'))return cloud?send(404,{error:'APIが見つかりません。'}):next();
  const origin=req.headers.origin;
  if(req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`))return send(403,{error:'別のサイトからの要求は受け付けません。'});
  try{
   if(!['/api/config','/api/jr','/api/walking','/api/odpt/catalog','/api/odpt/timetable'].includes(pathname))return send(404,{error:'APIが見つかりません。'});
   if((pathname==='/api/walking'&&req.method!=='POST')||(pathname!=='/api/walking'&&req.method!=='GET'))return send(405,{error:'このHTTPメソッドは使用できません。'});
   const services=await getServices();
   if(pathname==='/api/config')return send(200,await services.getConfig());
   if(pathname==='/api/odpt/catalog'){
    if([...url.searchParams.keys()].some(key=>!['provider','__path'].includes(key))||url.searchParams.getAll('provider').length!==1)throw new RequestError(400,'ODPT事業者のみ指定してください。');
    if(!services.odpt)throw new RequestError(503,'ODPTの認証データは未設定です。');
    return send(200,await services.odpt.catalog(url.searchParams.get('provider')));
   }
   if(pathname==='/api/odpt/timetable'){
    if([...url.searchParams.keys()].some(key=>!['station','date','__path'].includes(key))||url.searchParams.getAll('station').length!==1||url.searchParams.getAll('date').length!==1)throw new RequestError(400,'ODPT駅と運行日のみ指定してください。');
    if(!services.odpt)throw new RequestError(503,'ODPTの認証データは未設定です。');
    const day=url.searchParams.get('date');try{validDate(day);}catch{throw new RequestError(400,'運行日をYYYY-MM-DD形式で指定してください。');}
    return send(200,await services.odpt.timetable(url.searchParams.get('station')||'',day));
   }
   if(pathname==='/api/jr'){
    const day=url.searchParams.get('date');try{validDate(day);}catch{throw new RequestError(400,'運行日をYYYY-MM-DD形式で指定してください。');}
    return send(200,await services.getJrTimetables(day));
   }
   return send(200,await services.route(await jsonBody(req)));
  }catch(error){
   const safe=error instanceof RequestError||/^(現在地|確認済み|この試作版|このHTTP|徒歩|経路|公開試用|ローカル試用|共有キャッシュ|公開版|APP_ORIGIN|JRの運行日|ODPT)/.test(error?.message||'');
   return send(error instanceof RequestError?error.status:503,{error:safe?error.message:'取得処理に失敗しました。設定と通信状態を確認してください。'});
  }
 };
}
export function createApiMiddleware(env){
 const odpt=createChallengeService({env,local:true});
 let walking;const getWalking=()=>walking??=loadWalkingService(env);
 return createApiHandler({getServices:async()=>({odpt,getConfig:async()=>({...((await getWalking()).config),odptChallenge:await odpt.status()}),getJrTimetables,route:async input=>(await getWalking()).route(input)})});
}
export function localApiPlugin(env){const middleware=createApiMiddleware(env);return{name:'maniau-local-api',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};}

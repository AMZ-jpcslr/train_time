import {readFile} from 'node:fs/promises';
import {createRedis,namespace} from './redis.mjs';
import {createCloudJrService} from './cloud-jr.mjs';
import {createRoutingGate} from './cloud-routing.mjs';
import {createWalkingService} from './walking-service.mjs';
import {createChallengeService} from './odpt-challenge-service.mjs';
export function deploymentOrigin(env){
 const value=env.APP_ORIGIN||(env.VERCEL_PROJECT_PRODUCTION_URL?`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`:null);
 if(!value)return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;return u.origin;}catch{return null;}
}
export async function createCloudServices(env=process.env,{redis:injectedRedis,entrances:injectedEntrances,fetchImpl=fetch,clock=Date.now,jrLoader}={}){
 let redis=null,redisReason=null;
 try{redis=injectedRedis===undefined?createRedis(env,fetchImpl):injectedRedis;}catch{redisReason='共有キャッシュの環境変数を確認してください。';}
 const prefix=namespace(env),appOrigin=deploymentOrigin(env),jr=createCloudJrService({redis,prefix,clock,loader:jrLoader});
 const odpt=createChallengeService({env,redis,prefix,fetchImpl,clock});
 const entrances=injectedEntrances??JSON.parse(await readFile(new URL('../src/data/entrances.json',import.meta.url),'utf8'));
 const disabledReason=redisReason||(!redis?'公開版の経路計算には共有キャッシュの設定が必要です。':!appOrigin?'APP_ORIGINにこのアプリのHTTPS公開URLを設定してください。':null);
 let walking;
 try{walking=createWalkingService({entrances,fetchImpl,clock,contactEmail:env.ROUTING_CONTACT_EMAIL??'',baseUrl:env.ROUTING_FOOT_URL||undefined,privacyUrl:env.ROUTING_PRIVACY_URL||null,localPrototype:false,appOrigin:appOrigin||'https://invalid.example',disabledReason,gate:createRoutingGate({redis,prefix})});}
 catch{walking={config:{enabled:false,disabledReason:'徒歩専用サーバーの環境変数を確認してください。',provider:'未設定',contactEmail:null,privacyUrl:null,localPrototype:false},route:async()=>{throw Error('徒歩専用サーバーの環境変数を確認してください。');}};}
 return{
  odpt,
  getJrTimetables:jr.getJrTimetables,
  route:walking.route,
  async getConfig(){
   const config={...walking.config,deployment:'vercel',sharedControls:redis?'configured':'missing',jrEnabled:Boolean(redis),odptChallenge:await odpt.status()};
   if(redis){try{if(await redis.command('PING')!=='PONG')throw Error('Unavailable');}catch{config.enabled=false;config.jrEnabled=false;config.odptChallenge.enabled=false;config.odptChallenge.reason='共有キャッシュに接続できません。';config.sharedControls='unavailable';config.disabledReason='共有キャッシュに接続できません。外部取得を停止しています。';}}
   return config;
  },
 };
}

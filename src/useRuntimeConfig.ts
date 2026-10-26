import {useEffect,useState} from 'react';
import {getRuntimeConfig,type RuntimeConfig} from './shared/api-client';

/** Configuration is server state; never persist it alongside the user's settings. */
export function useRuntimeConfig(){
 const [config,setConfig]=useState<RuntimeConfig|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  let active=true;
  getRuntimeConfig(controller.signal).then(value=>{if(active)setConfig(value);}).catch(()=>{if(active)setConfig(null);}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[]);
 return config;
}

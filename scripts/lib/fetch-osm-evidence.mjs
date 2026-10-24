import {setTimeout as pause} from 'node:timers/promises';
export async function fetchOsmEvidence(url){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{headers:{'User-Agent':'train-time/0.4 (https://github.com/AMZ-jpcslr/train_time; cached entrance association research)'},signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw Error('Overpass HTTP '+response.status);
   const raw=await response.text(),data=JSON.parse(raw);
   if(data.remark||!Array.isArray(data.elements))throw Error('Incomplete Overpass response');
   return raw;
  }catch(error){if(attempt===2)throw error;await pause(5000*(attempt+1));}
 }
}

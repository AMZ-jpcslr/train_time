/** Recheck the official train examples used to classify Osaka's west branches. */
import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { obtain, OSAKA_TAKARAZUKA_PROOF, JR_SCOPE_VERSION } from './import-jr.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=path.join(root,'.cache/jr-route-proof');await mkdir(folder,{recursive:true});
const evidence=[];
for(const[destination,proof]of Object.entries(OSAKA_TAKARAZUKA_PROOF)){
 const id=new URL(proof.sourceUrl).pathname.split('/').at(-1);
 const source=await obtain(`${id}-20261023.html`,proof.sourceUrl,folder,process.argv.includes('--refresh'));
 const $=load(source.html),stations=$('td.cell-fixed').map((_,cell)=>$(cell).text().trim()).get();
 const start=stations.indexOf('大阪'),end=stations.lastIndexOf(destination),route=stations.slice(start,end+1);
 if(start<0||JSON.stringify(route)!==JSON.stringify(proof.path)||!$('body').text().includes(proof.trainNumber))throw Error(`Route proof changed: ${destination}`);
 const osaka=$('tr').filter((_,row)=>$(row).find('td.cell-fixed').text().trim()==='大阪');
 const departure=osaka.find('td.text div').map((_,item)=>$(item).text()).get().find(value=>value.endsWith('発'));
 if(departure!==(destination==='宝塚'?'14:15発':'14:30発'))throw Error('Osaka sample departure changed');
 evidence.push({destination,trainNumber:proof.trainNumber,sourceUrl:proof.sourceUrl,retrievedAt:source.retrievedAt,sha256:source.sha256,osakaDeparture:departure,path:route});
}
await writeFile(path.join(root,'docs/jr-scope-validation.json'),JSON.stringify({scopeVersion:JR_SCOPE_VERSION,routeMapUrl:'https://www.jr-odekake.net/station/pdf/teisya_01.pdf',method:'Official train detail station sequence: Osaka -> Amagasaki -> Tsukaguchi -> Takarazuka (-> Shin-Sanda). Exact destination classification applies only to Osaka west; unknown destinations stop import.',samples:evidence},null,2)+'\n');
console.log(`JR Osaka route scope: ${evidence.length} official train paths matched.`);

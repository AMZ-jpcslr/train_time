import {load} from 'cheerio';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base='https://ckan.odpt.org';
const refresh=process.argv.includes('--refresh');
const seen=new Set(), datasets=new Map();
const queue=[base+'/dataset/?tags='+encodeURIComponent('鉄道-railway')];
await mkdir('.cache/odpt',{recursive:true});
while(queue.length){
 const url=queue.shift();if(seen.has(url))continue;seen.add(url);
 const response=await fetch(url);if(!response.ok)throw Error(`${response.status} ${url}`);
 const $=load(await response.text());
 $('.dataset-heading a').each((_,a)=>datasets.set(new URL($(a).attr('href'),base).href,$(a).text().trim()));
 $('.pagination a').each((_,a)=>{const href=new URL($(a).attr('href'),base);if(href.searchParams.get('tags')==='鉄道-railway'&&!seen.has(href.href))queue.push(href.href);});
}
const results=[];
const cached=JSON.parse(await readFile('.cache/odpt/catalog.json','utf8').catch(()=>'[]'));
for(const [url,title] of datasets){
 const prior=cached.find(p=>p.url===url);if(prior&&!refresh){results.push(prior);continue;}
 const $=load(await(await fetch(url)).text());
 const resources=$('.resource-list .heading').toArray().map(a=>({name:$(a).text().trim(),page:new URL($(a).attr('href'),base).href}));
 const entry={url,title,notes:$('.notes').text().trim(),license:$('[rel="dc:rights"]').text().trim(),links:$('a').toArray().map(a=>({name:$(a).text().trim(),url:$(a).attr('href')})).filter(a=>/license|terms/i.test(a.url??'')),resources};
 for(const resource of resources){
  const r=load(await(await fetch(resource.page)).text());
  resource.url=r('.resource-url-analytics').attr('href')??r('a[href*="api.odpt.org"]').attr('href');
  resource.description=r('.prose').text().trim();
 }
 results.push(entry);
 console.log(results.length,title,resources.map(r=>r.url).join(' '));
 await writeFile('.cache/odpt/catalog.json',JSON.stringify(results,null,2));
}
await writeFile('.cache/odpt/catalog.json',JSON.stringify(results,null,2));

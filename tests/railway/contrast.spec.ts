import {setMinutes,locationSettings} from './walking-helpers';
import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,openWalkingSettings} from '../fixtures/runtime';
async function contrast(page:import('@playwright/test').Page){return page.evaluate(()=>{
 const parse=(s:string)=>{const n=s.match(/[\d.]+/g)?.map(Number)??[];return [n[0]??255,n[1]??255,n[2]??255,n[3]??1];};
 const luminance=(rgb:number[])=>rgb.slice(0,3).reduce((sum,n,i)=>{n/=255;return sum+(n<=.04045?n/12.92:((n+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
 const issues:string[]=[];
 for(const e of document.querySelectorAll<HTMLElement>('.railway-shell *')){
  if(!e.getClientRects().length||e.closest('button:disabled,.sr-only')||!Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent?.trim()))continue;
  let hidden=false,closed=e.closest('details:not([open])');while(closed){if(!closed.querySelector(':scope > summary')?.contains(e)){hidden=true;break;}closed=closed.parentElement?.closest('details:not([open])')??null;}if(hidden)continue;
  const style=getComputedStyle(e);if(style.visibility==='hidden')continue;
  let bg=[255,255,255,1];const layers:number[][]=[];let ancestor:HTMLElement|null=e;
  while(ancestor){layers.unshift(parse(getComputedStyle(ancestor).backgroundColor));ancestor=ancestor.parentElement;}
  for(const layer of layers)bg=bg.map((n,i)=>i<3?layer[i]*layer[3]+n*(1-layer[3]):1);
  const a=luminance(parse(style.color)),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  if(ratio<4.5)issues.push(`${e.className}:${e.textContent?.slice(0,22)} ${ratio.toFixed(2)}`);
 }return issues;
});}
test('railway readable text in the main display and walking dialog',async({page})=>{
 await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await setMinutes(page);
 expect(await contrast(page)).toEqual([]);const dialog=await locationSettings(page);expect(await contrast(page)).toEqual([]);await dialog.getByRole('button',{name:'徒歩時間を入力',exact:true}).click();expect(await contrast(page)).toEqual([]);const advanced=dialog.locator('.rail-setup-help').last();await advanced.locator(':scope > summary').click();await dialog.locator('.manual-fallback > summary').click();await dialog.locator('.place-form > summary').click();expect(await contrast(page)).toEqual([]);
});

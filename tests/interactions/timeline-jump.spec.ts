import {test,expect,type Page} from '@playwright/test';
import {chooseStation,mockRuntime} from '../fixtures/runtime';
import {openTimelineDiagram} from '../fixtures/timeline-view';

async function setup(page:Page,measured=true){
 // Fixed Date, live timers: native scrolling and rAF must really animate.
 await page.clock.setFixedTime(new Date('2026-10-23T14:00:00+09:00'));
 if(!process.env.INTERACTION_URL)await mockRuntime(page);
 await page.route('**/api/walking',route=>route.abort());
 await page.addInitScript(()=>{
  navigator.geolocation.getCurrentPosition=()=>{throw Error('Real GPS prohibited in this test');};
  navigator.geolocation.watchPosition=(_s,e)=>{e?.({code:1,message:'mock denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};
 });
 await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 if(measured)await measure(page);
 await openTimelineDiagram(page);
}
async function measure(page:Page,minutes='1'){
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await page.getByLabel('地点名',{exact:true}).fill('検証用の架空地点');await page.getByLabel('到着する駅入口',{exact:true}).fill('確認用入口');
 await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill(minutes);await page.getByRole('button',{name:'端末に保存して使う'}).click();
}

// CI recorded a 9 px residual snap offset after returning to the same selected train.
// Model that native scroll completion deterministically; the real swipe test stays separate.
test('explicit return corrects a residual native snap without changing selection',async({page})=>{
 await setup(page);
 const selected=await page.locator('.decision-train').innerText();
 const deadline=await page.locator('.stay-deadline').innerText();
 await page.evaluate(()=>{
  const strip=document.querySelector('.timeline-strip') as HTMLElement;
  strip.style.scrollSnapType='none';
  const scroll=strip.scrollTo.bind(strip);let first=true;
  strip.scrollTo=((options:ScrollToOptions)=>{
   if(first){first=false;scroll({...options,left:options.left!+9});}
   else scroll(options);
  }) as typeof strip.scrollTo;
 });
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();
 await expect.poll(()=>page.locator('.departure-card.is-selected').evaluate(card=>Math.abs(card.getBoundingClientRect().left-card.parentElement!.getBoundingClientRect().left-2))).toBeLessThan(3);
 expect(await page.locator('.decision-train').innerText()).toBe(selected);
 expect(await page.locator('.stay-deadline').innerText()).toBe(deadline);
});

for(const input of ['pointerdown','touchstart','wheel'])test(`a new ${input} cancels the return correction`,async({page})=>{
 await setup(page);
 await page.evaluate(input=>{
  const strip=document.querySelector('.timeline-strip') as HTMLElement;
  strip.style.scrollSnapType='none';
  const scroll=strip.scrollTo.bind(strip);let first=true;
  Object.assign(window,{__manualScrollEnded:false});
  strip.addEventListener('scrollend',()=>Object.assign(window,{__manualScrollEnded:true}),{once:true});
  strip.scrollTo=((options:ScrollToOptions)=>{
   if(first){
    first=false;scroll({...options,left:options.left!+9});
    // A user's next gesture wins over the earlier return command.
    strip.dispatchEvent(new Event(input,{bubbles:true}));
   } else scroll(options);
  }) as typeof strip.scrollTo;
 },input);
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as Window&{__manualScrollEnded?:boolean}).__manualScrollEnded)).toBe(true);
 expect(await page.locator('.departure-card.is-selected').evaluate(card=>Math.abs(card.getBoundingClientRect().left-card.parentElement!.getBoundingClientRect().left-2))).toBe(9);
});

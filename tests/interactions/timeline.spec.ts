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
async function aligned(page:Page,selector='.departure-card.is-selected'){
 await expect.poll(()=>page.locator(selector).first().evaluate(card=>Math.abs(card.getBoundingClientRect().left-card.parentElement!.getBoundingClientRect().left-2)),{timeout:8000}).toBeLessThan(3);
}
type ScrollSample={phase:'initial'|'frame'|'mutation'|'final';x:number;cursor:string;transform:number;expected:number;icon:number};
function synchronizationErrors(rows:ScrollSample[],start:number,end:number){
 const committed=rows.filter(s=>s.phase==='mutation'||s.phase==='final');
 const errors:string[]=[];
 if(!committed.some(s=>s.phase==='mutation'&&s.x>start+0.5&&s.x<end-0.5))errors.push('no intermediate rail update');
 if(!committed.length||committed.some(s=>!Number.isFinite(s.transform)||Math.abs(s.transform-s.expected)>1))errors.push('rail/native mismatch');
 const last=rows.at(-1);
 if(!last||last.phase!=='final'||Math.abs(last.x-end)>1||Math.abs(last.transform-last.expected)>1)errors.push('final mismatch');
 return errors;
}
async function sample(page:Page){
 await page.evaluate(()=>{
  // rAF can run before React's rAF in the same frame. Keep those samples as
  // diagnostics; compare synchronization only after actual style mutations.
  document.addEventListener('click',()=>{
   const strip=document.querySelector('.timeline-strip') as HTMLElement;
   const selected=strip.querySelector('.is-selected') as HTMLElement;
   const neighbor=selected.nextElementSibling as HTMLElement;
   const epoch=selected.dataset.epoch;
   const icon=document.querySelector(`.rail-train[data-epoch="${epoch}"]`) as HTMLElement;
   const neighborIcon=document.querySelector(`.rail-train[data-epoch="${neighbor.dataset.epoch}"]`) as HTMLElement;
   const translate=(el:HTMLElement)=>new DOMMatrixReadOnly(el.style.transform).m41;
   const railPitch=translate(neighborIcon)-translate(icon);
   const cardPitch=neighbor.offsetLeft-selected.offsetLeft;
   const selectedStart=selected.offsetLeft-(strip.firstElementChild as HTMLElement).offsetLeft;
   if(!(cardPitch>0&&railPitch>0))throw Error('Missing independent card/rail pitch');
   const rows:ScrollSample[]=[];let stopped=false;
   const capture=(phase:ScrollSample['phase'])=>rows.push({phase,x:strip.scrollLeft,cursor:document.querySelector('.rail-caption b')!.textContent!,transform:translate(icon),expected:-(strip.scrollLeft-selectedStart)/cardPitch*railPitch,icon:icon.getBoundingClientRect().left});
   capture('initial');
   const observer=new MutationObserver(()=>capture('mutation'));
   observer.observe(icon,{attributes:true,attributeFilter:['style']});
   const until=performance.now()+3000;
   function frame(){if(stopped)return;capture('frame');if(performance.now()<until)requestAnimationFrame(frame);}
   requestAnimationFrame(frame);
   Object.assign(window,{__finishScrollSamples:()=>{stopped=true;observer.disconnect();capture('final');return rows;}});
  },{capture:true,once:true});
 });
}
async function samples(page:Page){return page.evaluate(()=>(window as typeof window&{__finishScrollSamples:()=>ScrollSample[]}).__finishScrollSamples());}
async function screenshot(page:Page,name:string,project:string){await page.screenshot({path:`docs/screenshots/interactions-20261023/${process.env.INTERACTION_CAPTURE??'local'}-${project}-${name}.png`});}

test('selection synchronizes immediately and manual browsing animates cards and rail without changing the choice',async({page},info)=>{
 await setup(page);await aligned(page);await screenshot(page,'decision',info.project.name);
 const controls=page.getByRole('group',{name:'列車の移動と選択'});await expect(controls.getByRole('button')).toHaveCount(3);
 const bounds=await controls.getByRole('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
 expect(new Set(bounds.map(b=>b.y)).size).toBe(1);for(const b of bounds)expect(b.height).toBeGreaterThanOrEqual(44);
 const selectionStart=await page.locator('.timeline-strip').evaluate(e=>e.scrollLeft);
 await page.getByRole('button',{name:'一本後を選ぶ',exact:true}).click();await aligned(page);
 await expect(page.locator('.decision-train')).toContainText('14:15 発');await expect(page.locator('.stay-deadline')).toContainText('14:11');await expect(page.locator('.stay-deadline time')).toHaveAttribute('datetime','2026-10-23T05:11:00.000Z');
 await expect(page.getByRole('heading',{name:'出発判断',exact:true})).toBeFocused();
 await expect(page.locator('.rail-caption b')).toHaveText('14:15');
 await expect(page.locator('.departure-card.is-selected .train-choice')).toHaveAttribute('aria-pressed','true');
 expect(await page.locator('.timeline-strip').evaluate(e=>e.scrollLeft)).toBeGreaterThan(selectionStart+100);
 // Selection synchronizes without animation so the hero's focus cannot cancel it.
 // The separate browsing control still uses native smooth scrolling and rAF.
 const chosen=await page.locator('.decision-train').textContent(),deadline=await page.locator('.stay-deadline').textContent();
 const start=await page.locator('.timeline-strip').evaluate(e=>e.scrollLeft);await sample(page);
 await page.getByRole('button',{name:'後の便 →',exact:true}).click();await aligned(page,'.departure-card.is-selected + .departure-card');
 await expect(page.locator('.rail-caption b')).toHaveText('14:23');
 const end=await page.locator('.timeline-strip').evaluate(e=>e.scrollLeft),frames=await samples(page);
 await info.attach('native-rail-synchronization',{body:JSON.stringify(frames),contentType:'application/json'});
 expect(end).toBeGreaterThan(start+100);
 expect(synchronizationErrors(frames,start,end)).toEqual([]);
 // Same train, not whichever icon happens to be first after re-rendering.
 expect(frames.at(-1)!.icon).toBeLessThan(frames[0].icon-10);
 // Negative controls replay the same native trajectory. They do not stop product JS.
 const finalOnly=frames.map(s=>s.phase==='final'?s:{...s,transform:frames[0].transform});
 expect(synchronizationErrors(finalOnly,start,end)).toContain('rail/native mismatch');
 const reversed=frames.map(s=>({...s,transform:-s.expected}));
 expect(synchronizationErrors(reversed,start,end)).toContain('rail/native mismatch');
 expect(synchronizationErrors(frames.filter(s=>s.phase!=='mutation'),start,end)).toContain('no intermediate rail update');
 await expect(page.locator('.decision-train')).toHaveText(chosen!);await expect(page.locator('.stay-deadline')).toHaveText(deadline!);
 await expect(page.locator('.departure-card.is-selected .train-choice')).toHaveAccessibleName('次発 14:15発 国際会館行きを選ぶ');
 const labelFit=await page.locator('.rail-train small').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),p=e.closest('.rail-track')!.getBoundingClientRect();return r.bottom<=p.bottom+1&&e.scrollWidth<=e.clientWidth;}));expect(labelFit).toBe(true);
 await screenshot(page,'next',info.project.name);
 await page.getByRole('button',{name:'現在付近へ',exact:true}).click();await aligned(page,'.departure-card:has(.train-choice)');
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();await aligned(page);await expect(page.locator('.decision-train')).toContainText('14:08 発');
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('browser touch swipe moves the timeline without changing the chosen train or the departure calculation',async({page,context,browserName},info)=>{
 test.skip(browserName!=='chromium','WebKit has no CDP touch-injection API; covered separately by button/keyboard/layout tests.');
 await setup(page);await aligned(page);const selected=await page.locator('.decision-train').innerText(),deadline=await page.locator('.stay-deadline').innerText();
 const strip=page.locator('.timeline-strip');await strip.scrollIntoViewIfNeeded();const box=(await strip.boundingBox())!,session=await context.newCDPSession(page);
 const start=await strip.evaluate(e=>e.scrollLeft),caption=await page.locator('.rail-caption').innerText();
 const epoch=await page.locator('.departure-card.is-selected').getAttribute('data-epoch');
 const icon=page.locator(`.rail-train[data-epoch="${epoch}"]`),iconBefore=(await icon.boundingBox())!.x;
 const y=Math.min(box.y+120,750),right=box.x+box.width-25,left=box.x+25;
 async function swipe(from:number,to:number){
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y}]});
  for(let i=1;i<=12;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*i/12,y}]});await page.waitForTimeout(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await swipe(right,left);await expect.poll(()=>strip.evaluate(e=>e.scrollLeft)).toBeGreaterThan(start+100);
 await expect.poll(async()=>(await icon.boundingBox())?.x??Infinity).toBeLessThan(iconBefore-10);
 await expect(page.locator('.rail-caption')).not.toHaveText(caption);expect(await page.locator('.decision-train').innerText()).toBe(selected);expect(await page.locator('.stay-deadline').innerText()).toBe(deadline);
 await page.waitForTimeout(700);const after=await strip.evaluate(e=>e.scrollLeft),iconAfter=(await icon.boundingBox())!.x;await swipe(left,right);await expect.poll(()=>strip.evaluate(e=>e.scrollLeft)).toBeLessThan(after-100);
 await expect.poll(async()=>(await icon.boundingBox())?.x??-Infinity).toBeGreaterThan(iconAfter+10);
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();await aligned(page);await screenshot(page,'swipe-return',info.project.name);
});

test('location refusal recovers through measured walking time, with reachable trains beyond five',async({page},info)=>{
 await setup(page,false);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.decision-location-note')).toContainText('拒否');await expect(page.locator('.stay-countdown')).toHaveText('計算できません');await expect(page.getByRole('button',{name:'出発に余裕のある便へ'})).toBeDisabled();
 await screenshot(page,'denied',info.project.name);await measure(page,'60');await aligned(page);
 await expect(page.locator('.decision-train')).toContainText('15:08 発');expect(await page.locator('.departure-card .comfortable,.departure-card .tight').count()).toBeGreaterThanOrEqual(3);
 await screenshot(page,'reachable',info.project.name);
});

test('reduced motion, keyboard boundaries and long operator/type names remain usable',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await setup(page);await aligned(page);
 const strip=page.locator('.timeline-strip');await strip.focus();await strip.press('Home');await expect(page.locator('.departure-card').first()).toBeInViewport();await expect(page.locator('.past-choice').first()).toBeDisabled();
 await strip.press('End');await expect(page.locator('.departure-card').last()).toBeInViewport();await expect(strip).toBeFocused();
 await chooseStation(page,'hankyu-umeda');await openTimelineDiagram(page);await expect(page.locator('.rail-stations')).toContainText('大阪梅田');
 await expect(page.locator('.train-type[data-type-color="#EA5504"]').first()).toBeAttached();
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await screenshot(page,'hankyu',info.project.name);
});

test('repeated selection and changing direction during animation finish at the intended train',async({page})=>{
 await setup(page);await aligned(page);
 const next=page.getByRole('button',{name:'一本後を選ぶ',exact:true});await next.click();await next.click();await aligned(page);
 await expect(page.locator('.decision-train')).toContainText('14:23 発');
 await next.click();await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await openTimelineDiagram(page);await aligned(page);
 await expect(page.locator('.rail-stations')).toContainText('丸太町');
 await expect.poll(async()=>await page.locator('.rail-caption b').innerText()).toBe((await page.locator('.decision-train strong').innerText()).split(' ')[0]);
});

test('official JR and Hankyu colors keep readable text and full service names',async({page},info)=>{
 await setup(page,false);
 // Live API expiry uses the real acquisition clock. A future scenario clock
 // would correctly reject a cache that is still fresh at the time of this run.
 const colorClock=process.env.INTERACTION_URL?new Date():new Date('2026-10-22T14:00:00+09:00');
 await page.clock.setFixedTime(colorClock);await info.attach('color-verification-clock',{body:colorClock.toISOString(),contentType:'text/plain'});
 await chooseStation(page,'jr-osaka');
 await openTimelineDiagram(page);
 for(const color of ['#000000','#FF9900','#0000FF'])await expect(page.locator(`.train-type[data-type-color="${color}"]`).first()).toBeAttached();
 await page.locator('.departure-card:has(.train-choice):has(.train-type[data-type-color="#0000FF"]) .train-choice').first().click();await aligned(page);
 await expect(page.locator('.action-destination .train-type')).toHaveCSS('color','rgb(23, 34, 28)');
 await expect(page.locator('.action-destination .train-type')).toContainText('新快速');await screenshot(page,'jr-type',info.project.name);
 await chooseStation(page,'hankyu-umeda');
 await openTimelineDiagram(page);
 await page.locator('.departure-card:has(.train-choice):has(.train-type[data-type-color="#EA5504"]) .train-choice').first().click();await aligned(page);
 await expect(page.locator('.action-destination .train-type')).toHaveCSS('border-left-color','rgb(234, 85, 4)');await screenshot(page,'hankyu-type',info.project.name);
});

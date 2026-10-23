import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FIXED_TIME,mockRuntime,chooseStation} from '../fixtures/runtime';

for(const orientation of ['horizontal','vertical'])for(const minutes of [1,60])test(`${orientation}, walk ${minutes} minutes`,async({page},info)=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);
 const api=await mockRuntime(page);await page.goto(`/?timeline=${orientation}`);await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await page.evaluate(()=>{navigator.geolocation.watchPosition=(_s,e)=>{e?.({code:1,message:'mock',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});
 await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.decision-location-note')).toContainText('拒否');
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();await expect(page.getByLabel('地点名',{exact:true})).toBeFocused();
 await page.getByLabel('地点名',{exact:true}).fill('比較用地点');await page.getByLabel('到着する駅入口',{exact:true}).fill('試験入口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill(String(minutes));await page.getByRole('button',{name:'端末に保存して使う'}).click();await page.clock.runFor(100);
 const dir='docs/screenshots/timeline-20261023/comparison';mkdirSync(dir,{recursive:true});const name=`${info.project.name}-${orientation}-${minutes}`;
 await page.screenshot({path:`${dir}/${name}.png`});
 const initial=await page.evaluate(()=>{
  const card=document.querySelector('.departure-card.is-selected')!,deadline=card.querySelector('.stay-deadline')!,train=card.querySelector('.decision-train')!,strip=document.querySelector('.timeline-strip')!;
  const box=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  return {card:box(card),deadline:box(deadline),train:box(train),strip:box(strip),deadlineVisible:deadline.getBoundingClientRect().bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,visibleCards:[...strip.children].filter(e=>e.classList.contains('departure-card')).filter(e=>{const r=e.getBoundingClientRect(),s=strip.getBoundingClientRect();return Math.min(r.right,s.right,innerWidth)-Math.max(r.left,s.left,0)>20&&Math.min(r.bottom,s.bottom,innerHeight)-Math.max(r.top,s.top,0)>20;}).length};
 });expect(initial.overflow).toBe(false);
 const note=(await page.locator('.is-selected .stay-note').boundingBox())!,departureCountdown=(await page.locator('.decision-countdown').boundingBox())!;
 expect(note.y+note.height).toBeLessThanOrEqual(departureCountdown.y);
 const first=await page.locator('.decision-train').innerText();await page.getByRole('button',{name:'一本後を選ぶ',exact:true}).click();await page.clock.runFor(100);expect(await page.locator('.decision-train').innerText()).not.toBe(first);
 const strip=page.locator('.timeline-strip');await strip.focus();const before=await page.locator('.rail-caption').innerText();await strip.press(orientation==='vertical'?'ArrowDown':'ArrowRight');await page.clock.runFor(100);expect(await page.locator('.rail-caption').innerText()).not.toBe(before);
 await strip.press('Home');await page.clock.runFor(100);await expect(page.locator('.departure-card').first()).toBeInViewport();await strip.press('End');await page.clock.runFor(100);await expect(page.locator('.departure-card').last()).toBeInViewport();
 await page.getByRole('button',{name:'現在付近へ',exact:true}).click();await page.clock.runFor(100);await expect(page.locator('.train-choice').first()).toBeInViewport();
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();await page.clock.runFor(100);await expect(page.locator('.departure-card.is-selected')).toBeInViewport();
 // Real browser wheel dispatch measures scroll ownership, not human task time.
 await page.evaluate(()=>window.scrollTo(0,0));const b=(await strip.boundingBox())!;await page.mouse.move(b.x+b.width/2,Math.min(b.y+120,700));
 const wheelBefore=await page.evaluate(()=>({page:scrollY,inner:document.querySelector('.timeline-strip')!.scrollTop}));await page.mouse.wheel(0,240);await page.clock.runFor(500);
 await expect.poll(()=>page.evaluate(()=>scrollY+document.querySelector('.timeline-strip')!.scrollTop)).not.toBe(wheelBefore.page+wheelBefore.inner);
 const wheelAfter=await page.evaluate(()=>({page:scrollY,inner:document.querySelector('.timeline-strip')!.scrollTop}));
 expect(api.walking).toHaveLength(0);expect(api.external).toEqual([]);
 writeFileSync(`${dir}/${name}.json`,JSON.stringify({orientation,minutes,viewport:page.viewportSize(),initial,wheelBefore,wheelAfter,flows:'next, past, last, current, reachable, denied to measured: passed',realUserStudy:false},null,2));
});

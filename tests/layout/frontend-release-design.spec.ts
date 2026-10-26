import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace} from '../fixtures/runtime';

const phase=process.env.DESIGN_REVIEW_PHASE??'after';
const directory=`docs/screenshots/frontend-release-20261026/${phase}`;
test('B decision hierarchy, narrow screens, enlarged text and keyboard operation',async({page})=>{
 test.setTimeout(60000);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await saveMeasuredPlace(page,'いつもの場所');
 await page.evaluate(()=>document.fonts.ready);mkdirSync(directory,{recursive:true});
 const readings=[];
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:width===1280?900:844});
  await page.evaluate(()=>window.scrollTo(0,0));await page.clock.runFor(100);
  await page.screenshot({path:`${directory}/b-${width}.png`});
  const reading=await page.evaluate(()=>{
   const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const hero=document.querySelector('.action-decision')!;
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,hero:box('.action-decision'),deadline:box('.stay-deadline'),train:box('.action-train'),heroTextSizes:[...hero.querySelectorAll('p,button,small')].map(e=>({text:e.textContent?.slice(0,40),size:getComputedStyle(e).fontSize})),bottomNav:box('.action-bottom-nav'),buttonTargets:[...document.querySelectorAll('.action-decision button,.timeline-help button,.action-bottom-nav button')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),fixedAnimations:[...document.querySelectorAll('.action-live *')].filter(e=>getComputedStyle(e).animationName!=='none').length};
  });readings.push(reading);expect(reading.overflow).toBe(false);
  if(phase==='after'){
   expect(reading.deadline.y).toBeLessThan(reading.train.y);
   expect(reading.buttonTargets.every(b=>b.height>=44&&b.width>=44)).toBe(true);
   expect(reading.fixedAnimations).toBe(0);
  }
 }
 await page.setViewportSize({width:320,height:844});
 await page.evaluate(()=>{const elements=[...document.querySelectorAll<HTMLElement>('.action-decision,.action-decision *,.departure-card,.departure-card *')],sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));elements.forEach((e,i)=>e.style.fontSize=`${sizes[i]*2}px`);});
 await page.locator('.action-decision').screenshot({path:`${directory}/b-320-text-200.png`});
 const enlarged=await page.evaluate(()=>['html','.action-decision','.stay-deadline','.stay-countdown','.departure-card.is-selected'].map(selector=>{const e=document.querySelector(selector)!;return {selector,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflow:e.scrollWidth>e.clientWidth};}));
 if(phase==='after')expect(enlarged.filter(r=>r.overflow)).toEqual([]);
 // Removing only this test's font overrides restores the normal document.
 await page.evaluate(()=>document.querySelectorAll<HTMLElement>('.action-decision,.action-decision *,.departure-card,.departure-card *').forEach(e=>e.style.removeProperty('font-size')));
 const before=await page.locator('.action-decision .decision-train').innerText();
 await page.getByRole('button',{name:'一本後を選ぶ',exact:true}).click();await page.clock.runFor(100);
 expect(await page.locator('.action-decision .decision-train').innerText()).not.toBe(before);
 await page.keyboard.press('Tab');await page.locator('.action-conditions').focus();await expect(page.locator('.action-conditions')).toBeFocused();
 const focus=await page.locator('.action-conditions').evaluate(e=>({outlineStyle:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth}));
 expect(focus.outlineStyle).not.toBe('none');
 await page.locator('.action-conditions').press('Enter');await expect(page.locator('#walking-settings')).toBeFocused();
 await page.locator('.action-bottom-nav button').first().click();await expect(page.locator('#favorite-stations')).toBeFocused();
 // Also enlarge all currently rendered text, including controls/navigation.
 // Dialog contents are not opened by this check and remain a separate scope.
 await page.evaluate(()=>{const elements=[...document.querySelectorAll<HTMLElement>('html,body,.action-live,.action-live *')],sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));elements.forEach((e,i)=>e.style.fontSize=`${sizes[i]*2}px`);window.scrollTo(0,0);});
 const allText=await page.evaluate(()=>{const badge=document.querySelector('.station-badge')!,app=document.querySelector('.action-live')!;return {overflow:document.documentElement.scrollWidth>innerWidth,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,navHeight:document.querySelector('.action-bottom-nav')!.getBoundingClientRect().height,bottomPadding:parseFloat(getComputedStyle(app).paddingBottom),stationCodeWrap:getComputedStyle(badge).whiteSpace,stationCodeOverflow:badge.scrollWidth>badge.clientWidth};});
 await page.screenshot({path:`${directory}/b-320-all-text-200.png`});
 expect(allText.overflow).toBe(false);
 if(phase==='after'){expect(allText.bottomPadding).toBeGreaterThanOrEqual(allText.navHeight);expect(allText.stationCodeWrap).toBe('nowrap');expect(allText.stationCodeOverflow).toBe(false);}
 expect(api.external).toEqual([]);
 writeFileSync(`${directory}/metrics.json`,JSON.stringify({phase,readings,enlarged,allText,focus,realUserStudy:false},null,2));
});

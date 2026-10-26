import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace} from '../fixtures/runtime';

test('action and compact card text enlarged to 200 percent remain inside their containers without overlap',async({page},info)=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await saveMeasuredPlace(page);
 // Unlike changing root font-size alone, this also enlarges explicit px text.
 await page.evaluate(()=>{const elements=[...document.querySelectorAll<HTMLElement>('.action-decision,.action-decision *,.departure-card,.departure-card *')];const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));elements.forEach((e,i)=>e.style.fontSize=`${sizes[i]*2}px`);});
 for(const selector of ['html','.action-decision','.departure-card.is-selected','.stay-countdown','.stay-deadline'])expect(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const note=(await page.locator('.stay-note').boundingBox())!,countdown=(await page.locator('.decision-countdown').boundingBox())!;expect(note.y+note.height).toBeLessThanOrEqual(countdown.y);
 await page.locator('.departure-card.is-selected').screenshot({path:`docs/screenshots/timeline-20261023/${info.project.name}-actual-200-percent.png`});
 await page.locator('.action-decision').screenshot({path:`docs/screenshots/timeline-20261023/${info.project.name}-action-200-percent.png`});
});

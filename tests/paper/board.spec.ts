import {test,expect,type Page} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,gpsWatchState,emitGps} from '../fixtures/runtime';
import {setMinutes} from '../railway/walking-helpers';
const out=process.env.MANIAU_REVIEW_DIR??'test-results/paper-captures';
async function setup(page:Page,denied=false){
 await page.clock.install({time:FIXED_TIME});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);
 await page.addInitScript(({denied})=>{
 if(!localStorage.getItem('mania-u:v1'))localStorage.setItem('mania-u:v1',JSON.stringify({stationId:'kyoto-imadegawa',directionId:'north',favorites:[],places:[],settings:{stationMinutes:3,speedKmh:4.8}}));
 const state={watches:[] as any[],cleared:[] as number[]};Object.assign(window,{__controlledGps:state});
 navigator.geolocation.watchPosition=(success,error,options)=>{state.watches.push({success,error,options});if(denied)queueMicrotask(()=>error?.({code:1} as GeolocationPositionError));return state.watches.length;};
 navigator.geolocation.clearWatch=id=>state.cleared.push(id);
 },{denied});
 await page.goto('/');await expect(page.locator('.paper-ticket')).not.toHaveCount(0);
}
async function sample(page:Page){const state=await gpsWatchState(page);await emitGps(page,10,state.count-1);await expect(page.locator('.paper-location')).toContainText('約1分');}
for(const mode of ['light','dark'] as const){
 test(mode+': ordered cards, expansion, theme preserves state and GPS, sticky header',async({page},info)=>{
 await page.emulateMedia({colorScheme:mode});await setup(page);await sample(page);
 await expect(page.locator('html')).toHaveAttribute('data-theme',mode);
 const times=await page.locator('.ticket-time').allTextContents();expect(times.length).toBeGreaterThan(5);
 expect(times).toEqual([...times].sort());
 const card=page.locator('.paper-ticket.comfortable').first();await card.locator('.ticket-toggle').click();await expect(card.locator('.ticket-detail')).toBeVisible();
 expect(await card.locator('.ticket-remaining').innerText()).toContain('分');
 const watches=await gpsWatchState(page),station=await page.getByRole('button',{name:'乗車駅',exact:true}).innerText();
 await page.getByRole('button',{name:'配色を切り替え'}).click();
 await expect(card.locator('.ticket-detail')).toBeVisible();expect(await gpsWatchState(page)).toEqual(watches);
 expect(await page.getByRole('button',{name:'乗車駅',exact:true}).innerText()).toBe(station);
 await page.getByRole('button',{name:'配色を切り替え'}).click();
 for(let i=0;i<7;i++)await card.locator('.ticket-toggle').click();
 await expect(page.locator('.ticket-detail')).toHaveCount(0);
 await card.locator('.ticket-toggle').focus();await page.keyboard.press('Enter');await expect(card.locator('.ticket-detail')).toBeVisible();
 await page.evaluate(()=>window.scrollTo({top:900,behavior:'instant'}));
 expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(500);
 const box=await page.locator('.paper-header').boundingBox();expect(box!.y).toBe(0);
 await expect(page.getByRole('button',{name:'現在地を再取得',exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await expect(page.getByRole('heading',{name:'次の電車、まにあう？'})).toBeInViewport();
 await page.screenshot({path:out+'/'+info.project.name+'-'+mode+'.png'});
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+info.project.name+'-'+mode+'-expanded.png'});
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',mode);
 });
 test(mode+': GPS denial remains neutral, retry succeeds, station and direction reset expanded row',async({page})=>{
 await page.emulateMedia({colorScheme:mode});await setup(page,true);
 await expect(page.locator('.paper-location')).toContainText('許可されていません');
 await expect(page.locator('.paper-ticket.unknown').first()).toBeVisible();await expect(page.locator('.paper-ticket.miss')).toHaveCount(0);
 await page.locator('.paper-ticket.unknown .ticket-toggle').first().click();await expect(page.locator('.ticket-detail')).toContainText('許可');
 await page.evaluate(()=>{const state=(window as any).__controlledGps;navigator.geolocation.watchPosition=(success,error,options)=>{state.watches.push({success,error,options});return state.watches.length;};});
 await page.getByRole('button',{name:'現在地を再取得',exact:true}).click();await sample(page);
 await expect(page.locator('.paper-ticket.comfortable')).not.toHaveCount(0);
 await page.locator('.paper-directions button[aria-pressed=false]').click();await expect(page.locator('.ticket-detail')).toHaveCount(0);
 await chooseStation(page,'kobe-gakuentoshi');await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toContainText('学園都市');
 await expect(page.locator('.ticket-detail')).toHaveCount(0);
 });
 test(mode+': manual walking supports three signals and metadata is not fabricated',async({page})=>{
 await page.emulateMedia({colorScheme:mode});await setup(page);await setMinutes(page,'8');await page.clock.fastForward(180000);
 await expect(page.locator('.paper-ticket.miss')).not.toHaveCount(0);
 await expect(page.locator('.paper-ticket.tight')).not.toHaveCount(0);
 await expect(page.locator('.paper-ticket.comfortable')).not.toHaveCount(0);
 await page.locator('.paper-ticket.comfortable .ticket-toggle').first().click();await expect(page.locator('.ticket-detail')).not.toContainText(/番線未確認|両編成/);
 await expect(page.locator('.ticket-remaining')).toContainText('分');
 });
}
test('small widths and text contrast in both color schemes',async({page})=>{
 await setup(page);await sample(page);
 for(const theme of ['light','dark']){
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'配色を切り替え'}).click();
 for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 const failures=await page.locator('.paper-header,.paper-board').evaluateAll(roots=>{
 const rgb=(s:string)=>s.match(/[\d.]+/g)?.map(Number)??[0,0,0];
 const lum=(c:number[])=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,b,i)=>a+b*[.2126,.7152,.0722][i],0);
 const failures:string[]=[];
 for(const root of roots)for(const el of root.querySelectorAll('*')){
 if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent?.trim())||!el.getBoundingClientRect().height)continue;
 if((el as HTMLButtonElement).disabled)continue;
 const style=getComputedStyle(el);let parent:Element|null=el,bg=[255,255,255];
 while(parent){const color=rgb(getComputedStyle(parent).backgroundColor);if(color.length<4||color[3]!==0){bg=color;break;}parent=parent.parentElement;}
 const a=lum(rgb(style.color)),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
 if(ratio<(large?3:4.5))failures.push(el.className+': '+ratio.toFixed(2));
 }return [...new Set(failures)];});
 expect(failures).toEqual([]);
 }
});
test('OS changes apply until user explicitly selects a theme',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await setup(page);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'配色を切り替え'}).click();await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('inaccurate and stale GPS stay neutral and allow retry; late callbacks cannot restore an old session',async({page})=>{
 await setup(page);let state=await gpsWatchState(page);await emitGps(page,200,state.count-1);
 await expect(page.locator('.paper-location')).toContainText('精度が不足');
 await expect(page.getByRole('button',{name:'現在地を再取得',exact:true})).toBeEnabled();
 await expect(page.locator('.paper-ticket.miss,.paper-ticket.comfortable,.paper-ticket.tight')).toHaveCount(0);
 await page.getByRole('button',{name:'現在地を再取得',exact:true}).click();await sample(page);
 state=await gpsWatchState(page);await emitGps(page,10,state.count-2);expect((await gpsWatchState(page)).count).toBe(state.count);
 await page.clock.fastForward(46000);await expect(page.locator('.paper-location')).toContainText('古く');
 await expect(page.locator('.paper-ticket.comfortable,.paper-ticket.tight,.paper-ticket.miss')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'現在地を再取得',exact:true})).toBeEnabled();
});

import {test,expect,type Page} from '@playwright/test';
import {startUpdateServer} from './fixtures/update-server';

test.describe.configure({timeout:60_000});

const stored={stationId:'kyoto-imadegawa',directionId:'north',favorites:['kyoto-imadegawa:north'],places:[{id:'saved-before-update',name:'更新前の登録地点',stationId:'kyoto-imadegawa',entrance:'大学側の入口',walkMinutes:8}],settings:{stationMinutes:4,speedKmh:4.2}};

async function controlled(page:Page){
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
async function showUpdatePanel(page:Page){
 await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toBeVisible();
 const tools=page.locator('details').filter({has:page.getByText('ホーム画面・ウィジェット',{exact:true})});
 if(await tools.count()&&!await tools.evaluate(e=>(e as HTMLDetailsElement).open))await tools.locator(':scope > summary').click();
}
async function updateUiReady(page:Page){
 await showUpdatePanel(page);
 await expect(page.getByRole('region',{name:'アプリの更新',exact:true}).getByRole('status')).toContainText(/アプリの更新を確認しました|オフラインでも開く準備ができました/);
 await expect(page.getByRole('button',{name:'アプリの更新を確認',exact:true})).toBeEnabled();
}
async function releaseShown(page:Page,release:string){
 await expect(page.locator('html')).toHaveAttribute('data-test-release',release);
 if(release!=='legacy')await showUpdatePanel(page);
}
async function requestUpdate(page:Page){
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();if(!registration)throw Error('Worker was not registered');await registration.update();});
}
async function waiting(page:Page){
 await expect.poll(()=>page.evaluate(async()=>(await navigator.serviceWorker.getRegistration())?.waiting?.state??null)).toBe('installed');
}
async function loadCount(page:Page){return page.evaluate(()=>Number(sessionStorage.getItem('pwa-test-loads')));}
async function cachedNames(page:Page){return page.evaluate(()=>caches.keys());}
async function assertStoredPlace(page:Page){
 const value=await page.evaluate(()=>JSON.parse(localStorage.getItem('mania-u:v1')??'null'));
 const {stationFavorites,...original}=value;
 expect(original).toEqual(stored);
 if(stationFavorites!==undefined)expect(stationFavorites).toEqual([]);
}

test('old installed cache-first app migrates all open tabs once without clearing registered places',async({page,context})=>{
 const server=await startUpdateServer();
 try{
  await page.goto(server.origin);await controlled(page);await releaseShown(page,'legacy');
  await page.evaluate(value=>localStorage.setItem('mania-u:v1',JSON.stringify(value)),stored);
  const other=await context.newPage();await other.goto(server.origin);await controlled(other);await releaseShown(other,'legacy');
  expect(await loadCount(page)).toBe(1);expect(await loadCount(other)).toBe(1);
  server.release('current');await requestUpdate(page);
  await releaseShown(page,'current');await releaseShown(other,'current');
  await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeVisible();
  await expect(page.locator('select')).toHaveCount(0);
  await assertStoredPlace(page);await assertStoredPlace(other);
  await expect.poll(()=>cachedNames(page)).toEqual(['mania-u-v2-update-test-current']);
  expect(await loadCount(page)).toBe(2);expect(await loadCount(other)).toBe(2);
  // A subsequent update check must not repeat the one-time migration navigation.
  await requestUpdate(page);expect(await loadCount(page)).toBe(2);expect(await loadCount(other)).toBe(2);
 }finally{await server.close();}
});

test('a later v2 release waits for the visible update action, then reloads every tab once',async({page,context})=>{
 const server=await startUpdateServer('current');
 try{
  await page.goto(server.origin);await controlled(page);await releaseShown(page,'current');await updateUiReady(page);
  await page.evaluate(value=>localStorage.setItem('mania-u:v1',JSON.stringify(value)),stored);
  const other=await context.newPage();await other.goto(server.origin);await controlled(other);await updateUiReady(other);
  const quickAccess=other.locator('.quick-access');
  await expect(quickAccess.getByRole('region',{name:'アプリの更新',exact:true})).toHaveCount(0);
  await expect(quickAccess.getByRole('region',{name:'お気に入りの駅と方面',exact:true}).getByRole('button',{name:/今出川/})).toBeVisible();
  const update=page.getByRole('region',{name:'アプリの更新',exact:true});
  const updateBox=await update.boundingBox(),installBox=await page.getByRole('region',{name:'アプリのホーム画面追加',exact:true}).boundingBox();
  expect(updateBox!.y).toBeGreaterThanOrEqual(installBox!.y+installBox!.height);
  await expect(page.getByRole('status',{name:'アップデートのお知らせ'})).toHaveCount(0);
  server.release('next');
  await page.getByRole('button',{name:'アプリの更新を確認',exact:true}).click();await waiting(page);
  await expect(page.getByText('新しいバージョンが使えます',{exact:false})).toBeVisible();
  await releaseShown(page,'current');await releaseShown(other,'current');
  expect(await loadCount(page)).toBe(1);expect(await loadCount(other)).toBe(1);
  const notice=page.getByRole('status',{name:'アップデートのお知らせ',exact:true});
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await expect(notice).toBeInViewport();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   expect((await notice.getByRole('button',{name:/タップして更新欄へ移動/}).boundingBox())?.height).toBeGreaterThanOrEqual(44);
   expect((await notice.getByRole('button',{name:'更新のお知らせを閉じる'}).boundingBox())?.height).toBeGreaterThanOrEqual(44);
   await page.screenshot({path:`docs/screenshots/update-popup-${width}.png`});
  }
  await notice.getByRole('button',{name:/タップして更新欄へ移動/}).click();
  await expect(notice).toHaveCount(0);await expect(update).toBeInViewport();await expect(update).toBeFocused();
  await expect(page.getByRole('button',{name:'最新版に更新',exact:true})).toBeInViewport();
  expect(await loadCount(page)).toBe(1);await waiting(page);
  await page.screenshot({path:'docs/screenshots/update-scroll-target-320.png'});
  await page.getByRole('button',{name:'最新版に更新',exact:true}).click();
  await releaseShown(page,'next');await releaseShown(other,'next');
  await expect.poll(()=>cachedNames(page)).toEqual(['mania-u-v2-update-test-next']);
  expect(await loadCount(page)).toBe(2);expect(await loadCount(other)).toBe(2);
  await assertStoredPlace(page);await assertStoredPlace(other);
  await expect(page.getByRole('button',{name:'最新版に更新',exact:true})).toHaveCount(0);
 }finally{await server.close();}
});

test('update notice can be dismissed without applying and reduced-motion navigation still reaches the update panel',async({page,context})=>{
 const server=await startUpdateServer('current');
 try{
  await page.goto(server.origin);await controlled(page);await updateUiReady(page);
  const other=await context.newPage();await other.emulateMedia({reducedMotion:'reduce'});await other.goto(server.origin);await controlled(other);await updateUiReady(other);
  server.release('next');await requestUpdate(page);await waiting(page);await waiting(other);
  await page.getByRole('button',{name:'更新のお知らせを閉じる',exact:true}).click();
  await expect(page.getByRole('status',{name:'アップデートのお知らせ'})).toHaveCount(0);await releaseShown(page,'current');expect(await loadCount(page)).toBe(1);
  await page.getByRole('button',{name:'最新版に更新',exact:true}).waitFor({state:'visible'});await waiting(page);
  await other.getByRole('button',{name:/タップして更新欄へ移動/}).click();
  const update=other.getByRole('region',{name:'アプリの更新',exact:true});
  await expect(update).toBeInViewport();await expect(update).toBeFocused();await releaseShown(other,'current');await waiting(other);
  await other.getByRole('button',{name:'最新版に更新',exact:true}).click();await releaseShown(page,'next');await releaseShown(other,'next');
  await expect(other.getByRole('status',{name:'アップデートのお知らせ'})).toHaveCount(0);
 }finally{await server.close();}
});

test('incomplete update cannot replace the last complete offline app or erase saved data',async({page,context})=>{
 const server=await startUpdateServer('current');
 try{
  await page.goto(server.origin);await controlled(page);await releaseShown(page,'current');await updateUiReady(page);
  await page.evaluate(value=>localStorage.setItem('mania-u:v1',JSON.stringify(value)),stored);
  server.release('broken');await requestUpdate(page);
  await expect.poll(()=>server.requests.filter(request=>request.release==='broken'&&request.path===server.brokenAsset&&request.status===503).length).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return {waiting:!!registration?.waiting,installing:!!registration?.installing};})).toEqual({waiting:false,installing:false});
  await expect(page.getByRole('button',{name:'最新版に更新',exact:true})).toHaveCount(0);
  expect(await cachedNames(page)).toContain('mania-u-v2-update-test-current');
  await context.setOffline(true);await page.reload();await releaseShown(page,'current');
  await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeVisible();
  await assertStoredPlace(page);
 }finally{await context.setOffline(false);await server.close();}
});

test('legacy automatic migration also waits for a complete download before replacing the old app',async({page,context})=>{
 const server=await startUpdateServer('legacy');
 try{
  await page.goto(server.origin);await controlled(page);await releaseShown(page,'legacy');
  await page.evaluate(value=>localStorage.setItem('mania-u:v1',JSON.stringify(value)),stored);
  server.release('broken');await requestUpdate(page);
  await expect.poll(()=>server.requests.filter(request=>request.release==='broken'&&request.path===server.brokenAsset&&request.status===503).length).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return {waiting:!!registration?.waiting,installing:!!registration?.installing};})).toEqual({waiting:false,installing:false});
  await releaseShown(page,'legacy');expect(await loadCount(page)).toBe(1);
  expect(await cachedNames(page)).toContain('mania-u-legacy-update-test');
  await context.setOffline(true);await page.reload();await releaseShown(page,'legacy');await assertStoredPlace(page);
 }finally{await context.setOffline(false);await server.close();}
});

test('controlled online navigation fetches the latest HTML and offline navigation keeps the installed shell',async({page,context})=>{
 const server=await startUpdateServer('current');
 try{
  await page.goto(server.origin);await controlled(page);await releaseShown(page,'current');await updateUiReady(page);
  server.release('next');await page.reload();await releaseShown(page,'next');
  await waiting(page);
  // The waiting worker has not activated: the previous complete shell remains the offline fallback.
  await context.setOffline(true);await page.reload();await releaseShown(page,'current');
  await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toBeVisible();
 }finally{await context.setOffline(false);await server.close();}
});

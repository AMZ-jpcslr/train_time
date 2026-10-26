import {test,expect} from '@playwright/test';
import {chooseStation,FIXED_TIME,mockRuntime,installGps,locate,previewAt,actualTime,saveMeasuredPlace} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('opt-in GPS and checked Imadegawa tables produce walking judgments in both directions',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await expect(page.locator('.next-train')).toBeVisible();await expect(page.locator('.judgment')).toContainText('判定不可');
 await expect(page.locator('.nearby')).toHaveCount(0);expect(api.walking).toHaveLength(0);await expect(page.getByLabel('地点名',{exact:true})).not.toBeVisible();
 await locate(page);await expect(page.locator('.walk-summary')).toContainText('1分');
 // At 14:00 the 14:02 southbound train is already beyond the 1+3 min walking estimate.
 // The first comfortable train is 14:09; an explicit earlier choice still reports the miss.
 await expect(page.locator('.action-decision .decision-train')).toContainText('14:09 発');await expect(page.locator('.judgment')).toContainText('徒歩で余裕あり');await expect(page.locator('.stay-deadline time')).toHaveText('14:05');
 await page.getByRole('button',{name:'先発 14:02発 新田辺行きを選ぶ',exact:true}).click();await expect(page.locator('.judgment')).toContainText('次の便がおすすめ');
 await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await expect(page.locator('.action-destination>strong').filter({hasText:'国際会館行き'})).toBeVisible();
 await expect(page.locator('.judgment')).toContainText('徒歩で余裕あり');await expect(page.locator('.stay-countdown')).toContainText('4分');await expect(page.locator('.departure-card:not(.is-past) .card-judgment.unknown')).toHaveCount(0);
 await expect(page.getByRole('img',{name:/^取得した徒歩経路/})).toBeVisible();
 await page.getByRole('button',{name:'この駅と方面をお気に入り'}).click();
 const favorites=page.getByRole('region',{name:'お気に入りの駅と方面',exact:true});
 const savedDirection=favorites.getByRole('button',{name:/今出川/});
 await expect(savedDirection).toHaveAttribute('aria-pressed','true');
 const favoriteBox=await favorites.boundingBox(),locationBox=await page.getByRole('region',{name:'現在地と徒歩検索'}).boundingBox(),boardBox=await page.getByRole('region',{name:'発車案内'}).boundingBox();
 expect(favoriteBox!.y).toBeGreaterThanOrEqual(locationBox!.y+locationBox!.height);expect(favoriteBox!.y+favoriteBox!.height).toBeLessThanOrEqual(boardBox!.y);expect((await savedDirection.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await chooseStation(page,'hankyu-rokko');await savedDirection.click();
 await expect(page.locator('.action-destination>strong').filter({hasText:'国際会館行き'})).toBeVisible();await expect(savedDirection).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:/出典・確認日/}).click();
 await expect(page.locator('.source-detail')).toContainText('出典照合済');await expect(page.locator('.source-detail')).toContainText('2025-02-22');await expect(page.locator('.source-detail')).toContainText('2026-03-14');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-imadegawa-walking.png`,fullPage:true});await page.reload();
 await expect(page.getByRole('button',{name:'この駅と方面をお気に入り'})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.judgment')).toContainText('判定不可');await expect(page.locator('.location-status')).toContainText('まだ取得していません');expect(api.external).toEqual([]);
});

test('all Hankyu stations use checked weekday data and preserve weekend through destinations',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');
 for(const station of ['hankyu-rokko','hankyu-sannomiya','hankyu-umeda']){
  await chooseStation(page,station);await locate(page,station);
  for(let i=0;i<await page.locator('.direction-tabs button').count();i++){
   await page.locator('.direction-tabs button').nth(i).click();await expect(page.locator('.next-train')).toBeVisible();expect(await page.locator('.train-choice').count()).toBeGreaterThan(5);
   await expect(page.locator('.judgment')).not.toContainText('判定不可');await expect(page.locator('.departure-board')).not.toContainText('現行未確認');
  }
 }
 await previewAt(page,'2026-10-24T14:00');await chooseStation(page,'hankyu-sannomiya');await page.getByRole('button',{name:'新開地・姫路方面'}).click();
 await expect(page.locator('.action-destination>strong').filter({hasText:'新開地行き'})).toBeVisible();await expect(page.locator('.departure-card:not(.is-past) .card-destination').nth(1)).toContainText('山陽姫路');await expect(page.locator('.judgment')).toContainText('徒歩で余裕あり');await expect(page.getByTestId('data-coverage')).toContainText('土曜・休日');
 await page.getByRole('button',{name:/出典・確認日/}).click();await expect(page.locator('.source-detail')).toContainText('2025-02-22');await expect(page.locator('.source-detail')).toContainText('出典照合済');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-hankyu-walking.png`,fullPage:true});expect(api.external).toEqual([]);
});

test('Hanshin Koshien uses GPS and keeps Kintetsu and Sanyo destinations',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'hanshin-koshien');await locate(page,'hanshin-koshien');
 await expect(page.locator('.departure-card:not(.is-past) .card-destination')).toContainText(['大阪梅田','大阪梅田','大阪梅田','近鉄奈良','大阪梅田']);await expect(page.locator('.judgment')).not.toContainText('判定不可');
 await page.getByRole('button',{name:'神戸三宮・山陽姫路方面'}).click();
 await expect(page.locator('.action-decision .decision-train')).toContainText('14:09 発');await expect(page.locator('.action-destination>strong')).toHaveText('西宮行き');
 await page.getByRole('button',{name:'先発 14:03発 須磨浦公園行きを選ぶ',exact:true}).click();await expect(page.locator('.action-destination>strong')).toHaveText('須磨浦公園行き');await expect(page.locator('.judgment')).toContainText('次の便がおすすめ');
 await expect(page.locator('.departure-card:not(.is-past) .card-destination')).toContainText(['須磨浦公園','高速神戸','西宮','山陽姫路','高速神戸']);await expect(page.locator('.departure-card:not(.is-past) .card-judgment.unknown')).toHaveCount(0);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-koshien-walking.png`,fullPage:true});expect(api.walking.every(r=>r.stationId==='hanshin-koshien')).toBe(true);expect(api.external).toEqual([]);
});

test('JR exact-date refresh supports October 23 and 24 in all four stations and fails closed for October 26',async({page},info)=>{
 test.setTimeout(90000);
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'jr-osaka');await locate(page,'jr-osaka');
 for(const date of ['2026-10-23','2026-10-24']){
  await previewAt(page,date+'T14:00');await expect(page.locator('.timetable-update')).toContainText('日付別公式時刻表を確認済み');await expect(page.getByTestId('data-coverage')).toContainText(date);
  for(const station of ['jr-osaka','jr-nishinomiya','jr-ibaraki','jr-minamikusatsu']){
   await chooseStation(page,station);await expect(page.locator('.walk-summary')).toContainText('道路経路');
   for(let i=0;i<2;i++){
    await page.locator('.direction-tabs button').nth(i).click();await expect(page.locator('.next-train')).toBeVisible();expect(await page.locator('.train-choice').count()).toBeGreaterThan(5);await expect(page.locator('.judgment')).not.toContainText('判定不可');
    if(station==='jr-osaka'&&i===1)await expect(page.locator('.departure-board')).not.toContainText(/宝塚|新三田/);
   }
  }
 }
 await page.getByRole('button',{name:/出典・確認日/}).click();await expect(page.locator('.source-detail')).toContainText('対象運行日：2026-10-24');await expect(page.locator('.source-detail')).toContainText('掲載改正：2026-10-03');await page.screenshot({path:`docs/screenshots/${info.project.name}-jr-daily.png`,fullPage:true});
 await previewAt(page,'2026-10-26T14:00');await expect(page.getByRole('heading',{name:'未取得',exact:true})).toBeVisible();await expect(page.locator('.timetable-update')).toContainText('この日の時刻表では出発目安を計算できません');await expect(page.locator('.next-train')).toHaveCount(0);
 expect(api.jrDates).toEqual(expect.arrayContaining(['2026-10-22','2026-10-23','2026-10-24','2026-10-26']));expect(api.external).toEqual([]);
});

test('geolocation denial leaves a working persisted measured-place fallback',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/');await page.evaluate(()=>{navigator.geolocation.watchPosition=(_success,error)=>{error?.({code:1,message:'Denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};navigator.geolocation.clearWatch=()=>{};});
 await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.location-status')).toContainText('拒否');await expect(page.locator('.judgment')).toContainText('判定不可');expect(api.walking).toHaveLength(0);
 await saveMeasuredPlace(page,'拒否時の登録地点');
 // The 14:06 train has 2 min slack, so the default is 14:14 (10 min slack).
 await expect(page.locator('.action-decision .decision-train')).toContainText('14:14 発');await expect(page.locator('.stay-countdown')).toHaveText('あと 10分');
 await page.getByRole('button',{name:'先発 14:06発 新神戸行きを選ぶ',exact:true}).click();await expect(page.locator('.judgment')).toContainText('余裕が少ない');await expect(page.locator('.stay-countdown')).toHaveText('あと 2分');
 await page.reload();await page.locator('.manual-fallback > summary').click();await page.getByRole('button',{name:'出発地点',exact:true}).click();await page.getByRole('dialog',{name:'出発地点を選ぶ'}).getByRole('option').filter({hasText:'拒否時の登録地点'}).click();
 await expect(page.locator('.walk-summary')).toContainText('登録地点の実測時間');await expect(page.locator('.judgment')).not.toContainText('判定不可');
});

test('inaccurate or stale GPS does not request a route or allow a walking judgment',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await installGps(page,'kyoto-imadegawa',200);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await page.clock.fastForward(20000);await expect(page.locator('.location-accuracy')).toContainText('位置精度が低い');await expect(page.locator('.judgment')).toContainText('判定不可');expect(api.walking).toHaveLength(0);
 await installGps(page,'kyoto-imadegawa',10,6*60000);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await page.clock.fastForward(20000);await expect(page.locator('.location-accuracy')).toContainText('現在地が古い');expect(api.walking).toHaveLength(0);
 await locate(page);expect(api.walking).toHaveLength(1);await page.clock.fastForward(6*60000);await expect(page.locator('.location-accuracy')).toContainText('現在地が古い');await expect(page.locator('.judgment')).toContainText('判定不可');await expect(page.locator('.route-diagram')).toHaveCount(0);
});

test('switching stations discards the old route while replacement is loading or failing',async({page})=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await locate(page);await expect(page.locator('.judgment')).not.toContainText('判定不可');
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/walking',async route=>{await pending;await route.fulfill({status:503,json:{error:'テスト：徒歩経路サービスに接続できません。'}});});
 await chooseStation(page,'hanshin-koshien');await expect(page.locator('.route-status')).toContainText('計算しています');await expect(page.locator('.walk-summary')).not.toContainText('道路経路');await expect(page.locator('.judgment')).toContainText('判定不可');await expect(page.locator('.route-diagram')).toHaveCount(0);
 release();await expect(page.locator('.route-error')).toContainText('経路取得失敗');await expect(page.locator('.judgment')).toContainText('判定不可');
});

test('walking speed and station movement affect the judgment without a separate safety addition',async({page})=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await locate(page);await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await expect(page.locator('.stay-countdown')).toContainText('4分');
 await page.getByRole('button',{name:/徒歩・駅構内時間の設定/}).click();await page.getByLabel('歩行速度（km/h）',{exact:true}).fill('1');await expect(page.locator('.walk-summary')).toContainText('5分');
 await expect(page.locator('.action-decision .decision-train')).toContainText('14:15 発');await expect(page.locator('.stay-deadline time')).toHaveText('14:07');
 await page.getByRole('button',{name:'先発 14:08発 国際会館行きを選ぶ',exact:true}).click();await expect(page.locator('.judgment')).toContainText('余裕が少ない');await expect(page.locator('.stay-countdown')).toHaveText('出発の目安は今です');
 await page.getByLabel('入口からホームまで（分）',{exact:true}).fill('0');await expect(page.getByLabel('安全余裕（分）',{exact:true})).toHaveCount(0);await expect(page.locator('.action-decision .decision-train')).toContainText('14:08 発');await expect(page.locator('.stay-countdown')).toHaveText('あと 3分');await expect(page.locator('.judgment')).toContainText('徒歩で余裕あり');
});

test('national holidays select holiday tables and New Year special days remain unavailable',async({page})=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'hankyu-sannomiya');await page.getByRole('button',{name:'新開地・姫路方面'}).click();await locate(page,'hankyu-sannomiya');
 await previewAt(page,'2026-11-03T14:00');await expect(page.locator('.clock')).toContainText('休日');await expect(page.locator('.action-destination>strong').filter({hasText:'新開地行き'})).toBeVisible();await expect(page.locator('.departure-card:not(.is-past) .card-destination').nth(1)).toContainText('山陽姫路');
 await page.getByRole('button',{name:/出典・確認日/}).click();await expect(page.locator('.source-detail')).toContainText('曜日別（weekend）');await previewAt(page,'2026-12-31T14:00');await expect(page.getByRole('heading',{name:'特定日のダイヤ未確認'})).toBeVisible();await expect(page.locator('.next-train')).toHaveCount(0);
});

test('midnight operating day, final departure, foreground resumption and expiry are explicit',async({page})=>{
 await mockRuntime(page);await page.goto('/');await actualTime(page,'2026-10-23T00:49:59+09:00');await expect(page.locator('.action-destination>strong').filter({hasText:'名谷行き'})).toBeVisible();await expect(page.locator('.next-train')).toContainText('24:50');await expect(page.locator('.action-decision .decision-countdown')).toContainText('予定発車まで 1分');await expect(page.locator('.action-decision')).not.toContainText('秒');await expect(page.locator('.clock')).toContainText('2026-10-22 運行日');
 await page.clock.setSystemTime(new Date('2026-10-23T00:50:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.getByRole('heading',{name:'この運行日の発車は終了しました'})).toBeVisible();
 await actualTime(page,'2026-12-01T14:00:00+09:00');await expect(page.getByRole('heading',{name:'ダイヤ適用期間外 / 要再確認'})).toBeVisible();await chooseStation(page,'kyoto-imadegawa');await expect(page.getByRole('heading',{name:'ダイヤ適用期間外 / 要再確認'})).toBeVisible();
 await previewAt(page,'2026-10-22T14:00');await expect(page.getByRole('heading',{name:'ダイヤ適用期間外 / 要再確認'})).toBeVisible();await expect(page.locator('.next-train')).toHaveCount(0);
});

test('mobile and desktop have no overflow, uncaught errors or external API calls',async({page},info)=>{
 const api=await mockRuntime(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await locate(page);
 await expect(page.getByRole('heading',{name:'出発判断',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`docs/screenshots/${info.project.name}-gps-board.png`,fullPage:true});expect(errors).toEqual([]);expect(api.external).toEqual([]);
});

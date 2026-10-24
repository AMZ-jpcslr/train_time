import {test,expect} from '@playwright/test';
import {mockRuntime} from '../fixtures/runtime';
import {challengeProviderNames} from '../../src/useChallengeCatalog';
const did='d-'+'1'.repeat(16),checkedAt='2026-10-24T04:59:00Z';
function fixture(provider:string){
 const name=challengeProviderNames[provider as keyof typeof challengeProviderNames],id=`challenge-${provider}-`+'0'.repeat(16);
 const sourceUrl='https://ckan.odpt.org/dataset/fictitious_test';
 const s={id,name:'架空検証駅',operator:name,line:'架空検証線',code:'TEST',lat:35,lon:139,directions:[{id:did,name:'架空終点方面'}],sourceUrl,challengeProvider:provider,timetablePath:`/api/odpt/timetable?station=${id}`,region:'首都圏',aliases:[]};
 return {stations:[s],coverage:{id:provider,operator:name,stationCount:1,checkedAt,sourceUrl,lines:[{name:s.line,stationCount:1}],audit:{unsupportedCalendars:0,unknownDestinations:0}}};
}
test('authenticated stations join search, favorites survive reload, date tables are lazy, and failures never show stale trains',async({page},info)=>{
 await page.clock.install({time:new Date('2026-10-24T14:00:00+09:00')});await mockRuntime(page);
 await page.route('**/api/config',r=>r.fulfill({json:{enabled:false,odptChallenge:{enabled:true,configured:true,reason:null}}}));
 await page.route('**/api/odpt/catalog?*',r=>r.fulfill({json:fixture(new URL(r.request().url()).searchParams.get('provider')!)}));
 const station=fixture('keio').stations[0],requests:string[]=[];let fail=false;
 await page.route('**/api/odpt/timetable?*',async r=>{
  const url=new URL(r.request().url());requests.push(url.search);const day=url.searchParams.get('date')!;
  if(fail){await r.fulfill({status:503,json:{error:'ODPTの取得状況を確認してください。'}});return;}
  await r.fulfill({json:[{id:'fictional-test-table',stationId:station.id,operator:station.operator,line:station.line,directionId:did,direction:'架空終点方面',dayType:'saturday',
   departures:[{time:'14:05:30',destination:'架空終点',trainType:'普通',platform:null}],sourceUrl:station.sourceUrl,checkedAt,retrievedAt:checkedAt,serviceDates:[day],validFrom:day,validTo:day,revisionDate:null,verification:'verified',notes:['架空テストデータ']}]});
 });
 await page.goto('/');await expect(page.getByRole('region',{name:'対応路線とデータ'})).toContainText('244');expect(requests).toEqual([]);
 await page.getByRole('button',{name:'乗車駅',exact:true}).click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});
 await dialog.getByLabel('駅名・路線で検索').fill('京王 架空検証駅');await expect(dialog.locator('[data-station-id]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'架空検証駅（架空検証線）をお気に入りに登録'}).click();expect(requests).toEqual([]);
 await dialog.getByRole('button',{name:'駅選択を閉じる'}).click();await page.reload();
 await page.getByRole('region',{name:'お気に入りの駅',exact:true}).getByRole('button',{name:/架空検証駅/}).click();
 await expect(page.locator('.next-train')).toContainText('14:05:30');expect(requests).toHaveLength(1);expect(requests[0]).toContain('date=2026-10-24');
 await expect(page.locator('.line-info')).toContainText('京王電鉄');await expect(page.locator('.judgment')).toContainText('判定不可');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-challenge-timetable.png`});
 fail=true;await page.reload();await expect(page.locator('.odpt-feed-message')).toContainText('ODPTの取得状況');await expect(page.locator('.next-train')).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'時刻表を再読み込み'}).click();await expect(page.locator('.next-train')).toContainText('14:05:30');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('one unavailable provider keeps other operators usable and exposes no credential input in the public app',async({page})=>{
 await page.clock.install({time:new Date('2026-10-24T14:00:00+09:00')});await mockRuntime(page);
 await page.route('**/api/config',r=>r.fulfill({json:{enabled:false,odptChallenge:{enabled:true,configured:true,reason:null}}}));
 await page.route('**/api/odpt/catalog?*',r=>new URL(r.request().url()).searchParams.get('provider')==='jr-east'?r.fulfill({status:503,json:{error:'Unavailable'}}):r.fulfill({json:fixture(new URL(r.request().url()).searchParams.get('provider')!)}));
 await page.goto('/');const coverage=page.getByRole('region',{name:'対応路線とデータ'});await expect(coverage).toContainText('取得できなかった事業者：JR東日本');
 await expect(coverage).toContainText('243');await expect(page.locator('input[type=password]')).toHaveCount(0);
});

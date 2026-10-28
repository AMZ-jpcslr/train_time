import {test,expect} from '@playwright/test';
import {mockRuntime,installGps,chooseChoice,FIXED_TIME,openWalkingSettings,closeWalkingSettings} from '../fixtures/runtime';
import {readFileSync} from 'node:fs';
import type {Entrance} from '../../src/domain/types';
import {stations as bundledStations} from '../../src/data/stations';
const added=JSON.parse(readFileSync(new URL('../../src/data/added-entrances.json',import.meta.url),'utf8')) as Entrance[];
import {challengeProviderNames} from '../../src/useChallengeCatalog';
const providers=Object.keys(challengeProviderNames),did='d-'+'1'.repeat(16),checkedAt='2026-10-24T04:59:00Z';
const fixture=(provider:string)=>{
 const entrance=added.find(e=>e.stationId.startsWith(`challenge-${provider}-`)&&e.osm?.association==='station-footpath')
  ??added.find(e=>e.stationId.startsWith(`challenge-${provider}-`))!;
 const operator=challengeProviderNames[provider as keyof typeof challengeProviderNames];
 const station={id:entrance.stationId,name:'架空入口検証駅',operator,line:'架空入口検証線',code:'TEST',lat:entrance.lat+.0001,lon:entrance.lon,sourceUrl:'https://ckan.odpt.org/dataset/fictitious_test',region:'首都圏',directions:[{id:did,name:'架空終点方面'}],challengeProvider:provider,timetablePath:`/api/odpt/timetable?station=${entrance.stationId}`};
 return {stations:[station],coverage:{id:provider,operator,stationCount:1,checkedAt,sourceUrl:station.sourceUrl,lines:[{name:station.line,stationCount:1}],audit:{unsupportedCalendars:0,unknownDestinations:0}}};
};
test('added stations across all eight authenticated operators calculate GPS walking time and clear routes when switching',async({page})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);const api=await mockRuntime(page);
 await page.route('**/api/config',r=>r.fulfill({json:{enabled:true,odptChallenge:{enabled:true,configured:true,reason:null}}}));
 await page.route('**/api/odpt/catalog?*',r=>r.fulfill({json:fixture(new URL(r.request().url()).searchParams.get('provider')!)}));
 await page.route('**/api/odpt/timetable?*',r=>r.fulfill({json:[]}));
 await page.goto('/classic.html');await expect(page.getByRole('region',{name:'対応路線とデータ'})).toContainText(`検索対象：${bundledStations.length+providers.length}駅・路線`);
 for(const provider of providers){
  const station=fixture(provider).stations[0];
  await closeWalkingSettings(page);await page.getByRole('button',{name:'乗車駅',exact:true}).click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});
  await dialog.getByLabel('駅名・路線で検索').fill(station.operator+' 架空入口検証駅');await dialog.locator(`[data-station-id="${station.id}"]`).click();
  await openWalkingSettings(page);await expect(page.getByRole('button',{name:'歩いて向かう駅入口',exact:true})).not.toContainText('未確認');
  await expect(page.getByRole('link',{name:'駅との対応根拠 ↗'})).toHaveAttribute('href',/^https:\/\/www.openstreetmap.org\/(node|way|relation)\//);
  await installGps(page,station.id,10);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
  await expect.poll(()=>api.walking.at(-1)?.stationId).toBe(station.id);await expect(page.locator('.walk-summary')).toContainText('道路経路');
  const requested=api.walking.at(-1)!;expect(added.some(e=>e.stationId===station.id&&e.id===requested.entranceId)).toBe(true);
  await expect(page.locator('.route-error')).toHaveCount(0);
 }
 const last=fixture(providers.at(-1)!).stations[0],options=added.filter(e=>e.stationId===last.id);
 if(options.length>1){await chooseChoice(page,'歩いて向かう駅入口',options[1].id);await expect.poll(()=>api.walking.at(-1)?.entranceId).toBe(options[1].id);await expect(page.locator('.walk-summary')).toContainText(options[1].name);}
 expect(api.external).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('unmapped tram stops retain the measured-time fallback without sending a fabricated entrance',async({page})=>{
 await page.clock.install({time:new Date('2026-10-24T14:00:00+09:00')});const api=await mockRuntime(page);
 await page.goto('/classic.html');await closeWalkingSettings(page);await page.getByRole('button',{name:'乗車駅',exact:true}).click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});
 await dialog.getByLabel('駅名・路線で検索').fill('とさでん 高知駅前');await dialog.locator('[data-station-id]').first().click();
 await expect(page.locator('.route-error')).toContainText('入口位置を確認できていない');expect(api.walking).toHaveLength(0);
 await expect(page.getByRole('region',{name:'対応路線とデータ'})).toContainText('0 / 76駅・路線');
});

test('officially reviewed shared-station entrance works and exposes its official source',async({page})=>{
 await page.clock.install({time:FIXED_TIME});const api=await mockRuntime(page);
 const entrance=added.find(e=>e.osm?.association==='official-shared-station')!;
 await page.goto('/classic.html');await closeWalkingSettings(page);await page.getByRole('button',{name:'乗車駅',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});await dialog.getByLabel('駅名・路線で検索').fill('白金台');
 await dialog.locator(`[data-station-id="${entrance.stationId}"]`).click();
 await openWalkingSettings(page);await expect(page.getByRole('link',{name:'事業者の公式案内 ↗'})).toHaveAttribute('href','https://www.tokyometro.jp/station/shirokanedai/index.html');
 await installGps(page,entrance.stationId,10);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect.poll(()=>api.walking.at(-1)?.entranceId).toBe(entrance.id);
 await expect(page.locator('.walk-summary')).toContainText('2番出入口');
});

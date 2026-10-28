import {test,expect} from '@playwright/test';
import catalog from '../../src/data/jr-station-catalog.json' with {type:'json'};
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace,closeWalkingSettings} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);});

test('official station search stays distinct from timetables and preserves favorites and settings',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await saveMeasuredPlace(page,'残す登録地点');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('mania-u:v1')!));
 const station=catalog.find(s=>s.name==='JR高槻')!;await closeWalkingSettings(page);await page.getByRole('button',{name:'乗車駅',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});await dialog.getByLabel('駅名・路線で検索').fill('高槻');
 await expect(dialog.locator('[data-station-id="'+station.id+'"]').locator('small').last()).toHaveText('駅名のみ。時刻表・出発目安は未対応。');
 await dialog.locator('[data-station-id="'+station.id+'"]').click();
 await expect(page.getByRole('heading',{name:'時刻表は未対応',exact:true})).toBeVisible();
 await expect(page.locator('.chosen-decision,.vertical-train,.direction-tabs,#walking-settings')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'現在地を更新',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'日付別時刻表を更新',exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'JR公式で時刻表を探す ↗',exact:true})).toHaveAttribute('href','https://www.jr-odekake.net/');
 await expect(page.locator('.catalog-source')).toContainText('2025-12-31');await expect(page.locator('.catalog-source')).toContainText('駅入口ではありません');
 await page.getByRole('button',{name:'この駅をお気に入り',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'この駅をお気に入り',exact:true})).toHaveAttribute('aria-pressed','true');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('mania-u:v1')!));expect(after.settings).toEqual(before.settings);expect(after.places).toEqual(before.places);expect(after.favorites).toEqual(before.favorites);
 expect(api.jrDates).toEqual([]);expect(api.walking).toEqual([]);expect(api.external).toEqual([]);
 const saved=page.getByRole('region',{name:'お気に入りの駅',exact:true}).getByRole('button',{name:/JR高槻/});await saved.scrollIntoViewIfNeeded();await expect(saved).toBeVisible();await chooseStation(page,'kyoto-imadegawa');await saved.click();await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toContainText('JR高槻');await page.getByRole('button',{name:'この駅をお気に入り',exact:true}).click();await expect(page.getByRole('button',{name:'この駅をお気に入り',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('region',{name:'お気に入りの駅',exact:true})).toHaveCount(0);
});

test('Kyoto line records stay separate and switching back to an existing JR station retains its daily feed',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');
 const kyoto=catalog.filter(s=>s.name==='JR京都');expect(kyoto).toHaveLength(2);expect(new Set(kyoto.map(s=>s.physicalStationId)).size).toBe(1);
 for(const station of kyoto){await chooseStation(page,station.id);await expect(page.locator('.line-info')).toContainText(station.line);await expect(page.getByRole('heading',{name:'時刻表は未対応',exact:true})).toBeVisible();}
 expect(api.jrDates).toEqual([]);
 await chooseStation(page,'jr-nishinomiya');await expect(page.locator('.chosen-decision')).toBeVisible();await expect(page.locator('.timetable-update')).toContainText('日付別公式時刻表を確認済み');
 const calls=api.jrDates.length;expect(calls).toBeGreaterThan(0);
 await chooseStation(page,kyoto[0].id);await expect(page.locator('.chosen-decision,.timetable-update')).toHaveCount(0);expect(api.jrDates).toHaveLength(calls);
 await page.getByRole('button',{name:'別の駅を選ぶ',exact:true}).click();await expect(page.getByRole('dialog',{name:'乗車駅を選ぶ'})).toBeVisible();expect(api.external).toEqual([]);
});

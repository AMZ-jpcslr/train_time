import {test,expect} from '@playwright/test';
import catalog from '../../src/data/jr-station-catalog.json' with {type:'json'};
import {FIXED_TIME,mockRuntime,chooseStation} from '../fixtures/runtime';

test('installed official station index remains searchable offline without requesting new JR timetables',async({page,context})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);const api=await mockRuntime(page);
 await page.goto('/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const station=catalog.find(s=>s.name==='JR高槻')!;await chooseStation(page,station.id);await expect(page.getByRole('region',{name:'今出る場合の発車目安',exact:true}).getByRole('heading',{name:'時刻表は未対応',exact:true})).toBeVisible();
 api.offline=true;await context.setOffline(true);await page.reload();
 await expect(page.getByRole('region',{name:'今出る場合の発車目安',exact:true}).getByRole('heading',{name:'時刻表は未対応',exact:true})).toBeVisible();await expect(page.locator('.chosen-decision,.vertical-train')).toHaveCount(0);
 const himeji=catalog.find(s=>s.name==='JR姫路')!;await chooseStation(page,himeji.id);await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toContainText('JR姫路');
 await expect(page.getByRole('region',{name:'今出る場合の発車目安',exact:true}).getByRole('heading',{name:'時刻表は未対応',exact:true})).toBeVisible();expect(api.jrDates).toEqual([]);expect(api.walking).toEqual([]);expect(api.external).toEqual([]);
});

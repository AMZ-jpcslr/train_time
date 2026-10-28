import {test,expect} from '@playwright/test';
import {mockRuntime,chooseStation,saveMeasuredPlace,actualTime} from '../fixtures/runtime';

test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2026-10-26T13:59:00+09:00')});await page.clock.pauseAt(new Date('2026-10-26T14:00:00+09:00'));
 await mockRuntime(page);await page.goto('/classic.html');
});

test('current Kaigan weekday eastbound uses measured walking and discloses retained-download provenance',async({page},info)=>{
 await chooseStation(page,'kobe-k05');await expect(page.locator('.chosen-service')).toContainText('14:11');
 await expect(page.locator('.chosen-remaining')).toHaveCount(0);await expect(page.locator('.route-error')).toContainText('入口位置');
 await saveMeasuredPlace(page,'確認用の登録地点');await expect(page.locator('.chosen-leave time')).toHaveText('14:07');await expect(page.locator('.chosen-leave time')).toHaveAttribute('datetime','2026-10-26T05:07:00.000Z');
 await page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true}).click();
 await page.getByRole('button',{name:'出典・確認日 ↗'}).click();await expect(page.locator('.source-detail')).toContainText('元のダウンロード日時：記録なし');await expect(page.locator('.source-detail')).toContainText('保存済み原本の取込');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`docs/screenshots/subway-followup-20261026/kaigan-${info.project.name}.png`});
 await page.reload();await expect(page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.chosen-remaining')).toHaveCount(0);
});

test('missing westbound and weekend data remain missing and are distinct from an actual end of service',async({page})=>{
 await chooseStation(page,'kobe-k05');await page.getByRole('button',{name:'新長田方面'}).click();
 await expect(page.locator('.decision-empty')).toContainText('未取得');await expect(page.locator('.vertical-train')).toHaveCount(0);await expect(page.locator('.decision-empty')).not.toContainText('発車は終了');
 await expect(page.getByRole('link',{name:'公式の駅情報を確認 ↗'})).toHaveAttribute('href','https://kotsu.city.kobe.lg.jp/subway/timetable1/chuoichibamae/');
 await page.getByRole('button',{name:'三宮・花時計前方面'}).click();await actualTime(page,'2026-10-31T14:00:00+09:00');
 await expect(page.locator('.decision-empty')).toContainText('未取得');await expect(page.locator('.chosen-service')).toHaveCount(0);
 await actualTime(page,'2026-10-26T23:59:00+09:00');await chooseStation(page,'kobe-k02');await expect(page.locator('.chosen-service')).toContainText('24:00');
 await actualTime(page,'2026-10-27T00:00:01+09:00');await expect(page.locator('.decision-empty')).toContainText('この運行日の便は終了');await expect(page.locator('.vertical-train')).toHaveCount(0);
});

test('terminal directions and coverage expose nine connected sections and twenty-seven missing sections',async({page})=>{
 await chooseStation(page,'kobe-k10');await expect(page.locator('.direction-tabs button')).toHaveCount(1);await expect(page.locator('.direction-tabs')).toContainText('三宮・花時計前方面');
 await chooseStation(page,'kobe-k01');await expect(page.locator('.direction-tabs button')).toHaveCount(1);await expect(page.locator('.direction-tabs')).toContainText('新長田方面');await expect(page.locator('.decision-empty')).toContainText('未取得');
 const coverage=page.getByRole('region',{name:'関西の対応状況'});await coverage.getByText('これから対応する路線・資料',{exact:true}).click();await expect(coverage).toContainText('9表を接続');await expect(coverage).toContainText('土休日の27表は未取得');
});

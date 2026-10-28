import { test, expect } from '@playwright/test';
import { chooseStation, mockRuntime, saveMeasuredPlace, chooseChoice ,openWalkingSettings,closeWalkingSettings,openWalkingAdvanced} from '../fixtures/runtime';
import { stations } from '../../src/data/stations';

// After the new source review, with no real geolocation or external requests.
const NOW = new Date('2026-10-26T14:00:00+09:00');
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(NOW.getTime() - 60000) });
  await page.clock.pauseAt(NOW);
});

test('expanded Kobe search separates Shin-Kobe lines and exposes only departing terminal directions', async ({ page }) => {
  const api = await mockRuntime(page);
  await page.goto('/classic.html');
  const trigger = page.getByRole('button', { name: '乗車駅', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '乗車駅を選ぶ' });
  await dialog.getByLabel('駅名・路線で検索').fill('神戸市営 新神戸');
  await expect(dialog.locator('[data-station-id]')).toHaveCount(2);
  await expect(dialog.locator('[data-station-id="kobe-s02"]')).toContainText('西神・山手線');
  await expect(dialog.locator('[data-station-id="kobe-s02-hokushin"]')).toContainText('北神線');
  await dialog.locator('[data-station-id="kobe-s02-hokushin"]').click();
  await expect(page.locator('.direction-tabs button')).toHaveCount(1);
  await expect(page.locator('.direction-tabs button')).toContainText('谷上方面');
  await expect(page.locator('.chosen-decision')).toBeVisible();

  for (const id of ['kobe-s17', 'kobe-s02', 'kobe-s01']) {
    const station = stations.find(s => s.id === id)!;
    await chooseStation(page, id);
    await expect(page.locator('.direction-tabs button')).toHaveCount(1);
    await expect(page.locator('.direction-tabs button')).toContainText(station.directions[0].name);
    await expect(page.locator('.direction-tabs button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chosen-decision')).toBeVisible();
    await expect(page.locator('.departure-board')).not.toContainText('現行未確認');
  }
  expect(api.walking).toHaveLength(0);
  expect(api.external).toEqual([]);
});

test('new Kobe station keeps measured walking inputs and station-direction favorites across reload', async ({ page }) => {
  const api = await mockRuntime(page);
  await page.goto('/classic.html');
  await chooseStation(page, 'kobe-s17');
  await openWalkingSettings(page);await expect(page.getByRole('button', { name: '歩いて向かう駅入口', exact: true })).toContainText('未確認');
  await expect(page.locator('.chosen-leave')).toHaveCount(0);
  await saveMeasuredPlace(page, '西神中央の実測地点');
  await expect(page.locator('.walk-summary')).toContainText('登録地点の実測時間');
  await expect(page.locator('.chosen-leave')).toHaveCount(1);
  await openWalkingAdvanced(page);
  await page.getByLabel('入口からホームまで（分）', { exact: true }).fill('4');
  await closeWalkingSettings(page);await page.getByRole('button', { name: 'この駅と方面をお気に入り' }).click();
  const favorites = page.getByRole('region', { name: 'お気に入りの駅と方面', exact: true });
  const favorite = favorites.getByRole('button', { name: /西神中央/ });
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await chooseStation(page, 'kobe-myohoji');
  await favorite.click();
  await expect(page.getByRole('button', { name: '乗車駅', exact: true })).toContainText('西神中央');
  await expect(page.locator('.direction-tabs button')).toHaveCount(1);

  await page.reload();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  // A stored place persists, but it must be selected after reload before estimating.
  await expect(page.locator('.chosen-leave')).toHaveCount(0);
  await openWalkingSettings(page);await page.locator('.manual-fallback > summary').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mania-u:v1')!));
  expect(saved.settings.stationMinutes).toBe(4);
  expect(saved.favorites).toContain('kobe-s17:east');
  const place = saved.places.find((p: { name: string }) => p.name === '西神中央の実測地点');
  expect(place).toMatchObject({ stationId: 'kobe-s17', walkMinutes: 1, entrance: '試験入口' });
  await chooseChoice(page, '出発地点', place.id);
  await expect(page.locator('.walk-summary')).toContainText('登録地点の実測時間');
  await expect(page.locator('.chosen-leave')).toHaveCount(1);
  expect(api.walking).toHaveLength(0);
  expect(api.external).toEqual([]);
});

test('Kansai coverage separates connected Kobe data from pending Kyoto and Kaigan data', async ({ page }) => {
  const api = await mockRuntime(page);
  await page.goto('/classic.html');
  const coverage = page.getByRole('region', { name: '関西の対応状況', exact: true });
  const local = stations.filter(s => /^(kobe-|kyoto-|jr-|hankyu-|hanshin-)/.test(s.id));
  await expect(coverage).toContainText(`${local.length}駅・路線`);
  await expect(coverage).toContainText(`まとめると${new Set(local.map(s => s.operator + '/' + s.name)).size}駅`);
  const kobe = coverage.locator('details').filter({ has: page.locator('summary', { hasText: '神戸市営地下鉄' }) });
  await kobe.locator('summary').click();
  const table = kobe.getByRole('table');
  const kobeDirectionCount = stations.filter(s => s.operator === '神戸市営地下鉄').reduce((count, s) => count + s.directions.length, 0);
  await expect(table.locator('tbody tr')).toHaveCount(kobeDirectionCount);
  const terminal = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^西神中央/ }) });
  await expect(terminal).toHaveCount(1);
  await expect(terminal).toContainText('平日・土休日');
  await expect(terminal).toContainText('取得済');
  await expect(terminal).toContainText('目安を計算できる時刻表あり');
  await expect(terminal.getByRole('link', { name: '出典を見る ↗' })).toHaveAttribute('href', /^https:\/\/catalog\.city\.kobe\.lg\.jp\//);
  await coverage.getByText('これから対応する路線・資料', { exact: true }).click();
  await expect(coverage).toContainText('128区分を取得済み');
  await expect(coverage).toContainText('概算扱い');
  await expect(coverage).toContainText('平日・三宮・花時計前方面の9表を接続');
  await expect(coverage).toContainText('土休日の27表は未取得');
  await expect(coverage).toContainText('終電後という意味ではありません');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(api.external).toEqual([]);
});

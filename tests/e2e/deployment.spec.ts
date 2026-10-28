import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,openWalkingSettings} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('cloud configuration explains unavailable routing without claiming a connection',async({page})=>{
 const api=await mockRuntime(page);
 await page.route('**/api/config',route=>route.fulfill({json:{enabled:false,disabledReason:'共有キャッシュが未設定です。',provider:'FOSSGIS / OSRM（徒歩）',privacyUrl:'https://routing.openstreetmap.de/about.html',contactEmail:null,deployment:'vercel',localPrototype:false}}));
 await page.goto('/classic.html');await expect(page.getByRole('heading',{name:'出発目安',exact:true})).toBeVisible();
 await openWalkingSettings(page);await expect(page.locator('.route-note')).toContainText('現在は自動取得を利用できません');await expect(page.locator('.route-note')).toContainText('徒歩時間の一時入力か登録地点の実測時間');await expect(page.locator('.route-note')).not.toContainText('接続済み');
 await expect(page.locator('.chosen-leave')).toHaveCount(0);expect(api.walking).toHaveLength(0);expect(api.external).toEqual([]);
});

test('configured provider identity and privacy link are shown accurately',async({page})=>{
 const api=await mockRuntime(page);
 await page.route('**/api/config',route=>route.fulfill({json:{enabled:true,provider:'テスト徒歩サーバー',privacyUrl:'https://example.test/privacy',contactEmail:'operator@example.test',deployment:'vercel',localPrototype:false}}));
 await page.goto('/classic.html');await openWalkingSettings(page);await expect(page.locator('.route-note')).toContainText('位置情報から取得できます');await page.getByText('位置情報の取り扱い',{exact:true}).click();await expect(page.locator('.location-privacy')).toContainText('テスト徒歩サーバーへ送信');
 await expect(page.getByRole('link',{name:'経路サービスの条件・プライバシー'})).toHaveAttribute('href','https://example.test/privacy');
 await expect(page.getByRole('link',{name:'operator@example.test'})).toHaveAttribute('href','mailto:operator@example.test');expect(api.external).toEqual([]);
});

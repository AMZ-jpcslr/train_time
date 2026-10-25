import {test,expect} from '@playwright/test';
import {mockRuntime,FIXED_TIME} from '../fixtures/runtime';
// @ts-expect-error Pure metadata normalization; no provider access in fixtures
import {westernStation} from '../../server/western-service.mjs';
const station=westernStation({id:'scrape-hankyu:fictional-station',feedId:'scrape-hankyu',name:'試験十三',lat:34.72,lon:135.48,routes:[{name:'試験神戸線',mode:'rail'}]});
test('western search selects and persists a favorite, while reference tables never enable boarding judgments',async({page})=>{
 await page.clock.install({time:FIXED_TIME});await mockRuntime(page);
 await page.route('**/api/config',route=>route.fulfill({json:{enabled:false,western:{enabled:true,coverage:[{operator:'阪急電鉄',line:'試験神戸線'}]}}}));
 await page.route('**/api/western/search?*',route=>route.fulfill({json:{stations:[station],limited:false}}));
 await page.route('**/api/western/timetable?*',route=>{const date=new URL(route.request().url()).searchParams.get('date');return route.fulfill({json:[{id:'fictional-table',stationId:station.id,operator:station.operator,line:station.line,directionId:'all',direction:station.directions[0].name,dayType:'weekday',serviceDates:[date],validFrom:date,validTo:date,checkedAt:FIXED_TIME.toISOString(),retrievedAt:FIXED_TIME.toISOString(),sourceUrl:'https://api.transit.ls8h.com/',verification:'partial',notes:['fictional test departures'],departures:[{time:'14:30',destination:'試験行先',trainType:null,platform:null}]}]});});
 await page.goto('/');await page.getByRole('button',{name:'乗車駅',exact:true}).click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});
 await dialog.getByLabel('駅名・路線で検索').fill('阪急試験十三');await dialog.getByRole('button',{name:'JR西日本・阪急・阪神の駅も検索',exact:true}).click();
 await expect(dialog.getByText('西日本APIから1件を追加しました。',{exact:true})).toBeVisible();
 await dialog.getByLabel('駅名・路線で検索').fill('別の検索語');await expect(dialog.getByText('西日本APIから1件を追加しました。',{exact:true})).not.toBeVisible();
 await dialog.getByLabel('駅名・路線で検索').fill('阪急試験十三');
 await dialog.getByRole('button',{name:'試験十三（試験神戸線）をお気に入りに登録',exact:true}).click();await dialog.locator('[data-station-id="'+station.id+'"]').click();
 await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toContainText('試験十三');await expect(page.getByText('参考時刻（現行未確認）',{exact:true})).toBeVisible();
 await expect(page.getByText('現行未確認の参考時刻です。適用ダイヤまたは検証が未確認のため、この時刻表による乗車判断はできません。徒歩経路が取得できても判定不可です。',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'乗車駅',exact:true})).toContainText('試験十三');await page.getByRole('button',{name:'乗車駅',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'試験十三（試験神戸線）をお気に入りから解除',exact:true})).toHaveAttribute('aria-pressed','true');
});

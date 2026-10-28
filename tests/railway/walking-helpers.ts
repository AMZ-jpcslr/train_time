import {type Page,expect} from '@playwright/test';
import {openWalkingSettings} from '../fixtures/runtime';
export async function manualSettings(page:Page){const dialog=await openWalkingSettings(page);await dialog.getByRole('button',{name:'徒歩時間を入力',exact:true}).click();return dialog;}
export async function locationSettings(page:Page){const dialog=await openWalkingSettings(page);await dialog.getByRole('button',{name:'位置情報で設定',exact:true}).click();return dialog;}
export async function setMinutes(page:Page,minutes='2'){const dialog=await manualSettings(page);await dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true}).fill(minutes);await dialog.locator('.rail-manual-form').getByRole('button',{name:/で設定$/,exact:false}).click();await expect(dialog).not.toBeVisible();}

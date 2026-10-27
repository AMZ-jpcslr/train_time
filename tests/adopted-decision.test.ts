import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import ActionDecision from '../src/ActionDecision';
const now=Date.parse('2026-10-26T14:03:00+09:00');
const props={train:{epoch:Date.parse('2026-10-26T14:20:00+09:00'),time:'14:20',destination:'試験駅',trainType:'特急',platform:null},now,walk:{kind:'measured' as const,minutes:8},settings:{stationMinutes:3,speedKmh:4.8},stationId:'fixture',preview:true,onConditions:()=>{},rank:0};
const render=(overrides:Partial<Parameters<typeof ActionDecision>[0]>={})=>renderToStaticMarkup(createElement(ActionDecision,{...props,...overrides}));
describe('adopted departure decision safety and copy',()=>{
 it('uses the real calculation for the chosen train and labels the preview',()=>{const html=render({manual:true});expect(html).toContain('選んだ電車');expect(html).toContain('14:09');expect(html).toContain('指定時刻での試算');expect(html).toContain('2026-10-26T05:09:00.000Z');});
 it('guides an unset first visit without repeated cannot-calculate warnings',()=>{const html=render({walk:{kind:'unavailable'}});expect(html).toContain('徒歩時間を設定する');expect(html).not.toContain('判定不可');expect(html).not.toContain('chosen-leave');});
 it('never calculates reference data even if walking minutes are supplied',()=>{const html=render({reference:true});expect(html).toContain('公式時刻表を確認');expect(html).not.toContain('chosen-leave');});
 it('keeps an elapsed leave time explicit without guaranteeing boarding',()=>{const html=render({now:props.train.epoch-60000});expect(html).toContain('出発目安を過ぎています');expect(html).toContain('乗車を保証しません');});
 it('labels automatic choice and unknown train type independently',()=>{const html=render({train:{...props.train,trainType:null}});expect(html).toContain('条件に合う次の電車');expect(html).toContain('種別不明');});
});

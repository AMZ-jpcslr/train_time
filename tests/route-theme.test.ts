import {describe,it,expect} from 'vitest';
import {routeTheme,routeColors,luminance} from '../src/domain/routeTheme';
describe('route identity colours',()=>{
 it('does not confuse operators with the same line name',()=>{expect(routeTheme({operator:'JR東日本',line:'中央線快速'}).kind).toBe('route');expect(routeTheme({operator:'JR東海',line:'中央線快速'}).kind).toBe('neutral');expect(routeTheme({operator:'大阪メトロ',line:'中央線'}).kind).toBe('neutral');});
 it('prefers the line over company branding and forgets the previous colour',()=>{expect(routeTheme({operator:'東急電鉄',line:'田園都市線'}).color).not.toBe(routeTheme({operator:'東急電鉄',line:'不明'}).color);expect(routeTheme({operator:'未確認会社',line:'山手線'}).color).toBe('#31465b');});
 it('keeps every filled control readable',()=>{for(const key of Object.keys(routeColors)){const [operator,line]=key.split('|'),t=routeTheme({operator,line});const a=luminance(t.color),b=luminance(t.ink);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);}});
});

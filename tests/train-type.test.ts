import {describe,it,expect} from 'vitest';
import {trainTypeColor} from '../src/domain/trainType';
describe('official service colors are station/operator specific',()=>{
 it.each([
  ['jr-osaka','普通','#000000'],['jr-osaka','快速','#FF9900'],['jr-osaka','新快速','#0000FF'],
  ['jr-osaka','Ａ新快速（うれしート連結）','#0000FF'],['jr-osaka','A快速（うれしート連結）','#FF9900'],
  ['jr-osaka','普通（京都から快速）','#000000'],['jr-osaka','新快速（京都から快速）','#0000FF'],
  ['jr-osaka','関空特急はるか3号','#FF0000'],['jr-osaka','通勤特急らくラクびわこ1号（全車指定席）','#FF0000'],
  ['hankyu-rokko','普通','#000000'],['hankyu-rokko','特急','#EA5504'],['hankyu-rokko','準特急','#EA5504'],
  ['hankyu-rokko','通勤特急','#EA5504'],['hankyu-rokko','急行','#F6AB00'],['hankyu-rokko','快速','#008CD6'],['hankyu-rokko','準急','#009D6B'],
  ['hankyu-rokko','山陽S特急',null],['hanshin-koshien','直通特急',null],['jr-osaka','未確認種別',null],['jr-osaka',null,null],
 ])('%s / %s', (station,type,color)=>expect(trainTypeColor(station,type)).toBe(color));
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Import scripts intentionally remain standalone JavaScript.
import { parseKyotoHtml, readKyotoDates, validateKyotoSamples, validateKyotoCurrentPublication, KYOTO_SAMPLE_REVIEW } from '../scripts/import-kyoto.mjs';
import type { Timetable } from '../src/domain/types';

function fixture(direction = 'south', minutes = ['04', '<b class="tanabe">08<sup class="tanabe-super">新</sup></b>', '<b class="nara">43<sup class="nara-super">奈</sup></b>'], finalHour = 5) {
  const rows = ['wektime', 'holtime'].flatMap((rowClass, day) => Array.from({ length: 20 }, (_, i) => {
    const hour = i + 5;
    return `<tr class="${rowClass}"><td><h3>${hour}</h3></td><td>${hour === finalHour ? minutes.map((minute, n) => `<span class="${day ? 'disptnhol' : 'disptnwek'}" data-no="${n + 1}">${minute}</span>`).join('') : ''}</td></tr>`;
  })).join('');
  return `<html><head><title>烏丸線 今出川駅</title></head><body><div class="line-name">烏丸線</div><div id="tttab" class="direction-${direction === 'south' ? 'down' : 'up'}"></div><span class="tt-platform-num">${direction === 'south' ? 1 : 2}</span><p class="note-tt">急行 近鉄奈良行 普通 新田辺行 その他は竹田行</p><table class="tt-print-table">${rows}</table></body></html>`;
}

describe('Kyoto public HTML extraction', () => {
  it('keeps direction separate from ordinary/through destinations and types', () => {
    const result = parseKyotoHtml(fixture(), 'south');
    expect(result.map((r: { dayType: string }) => r.dayType)).toEqual(['weekday', 'weekend']);
    expect(result[0].departures).toEqual([
      { time: '05:04', destination: '竹田', trainType: '普通', platform: '1' },
      { time: '05:08', destination: '新田辺', trainType: '普通', platform: '1' },
      { time: '05:43', destination: '近鉄奈良', trainType: '急行', platform: '1', notes: ['竹田駅までは各駅に停車'] },
    ]);
  });
  it('retains north destination, platform and connection note', () => {
    expect(parseKyotoHtml(fixture('north', ['<span class="cc">58</span>']), 'north')[0].departures[0]).toEqual({ time: '05:58', destination: '国際会館', trainType: '普通', platform: '2', notes: ['烏丸御池駅で東西線との接続待ち'] });
  });
  it('preserves service-day 24-hour notation', () => {
    expect(parseKyotoHtml(fixture('north', ['04'], 24), 'north')[0].departures[0].time).toBe('24:04');
  });
  it.each([
    ['unknown destination', fixture('south', ['12宇'])],
    ['invalid minute', fixture('south', ['60'])],
    ['unknown note class', fixture('south', ['<b class="new-annotation">12</b>'])],
    ['inconsistent legend marker', fixture('south', ['12奈'])],
    ['wrong station', fixture().replace('今出川駅', '京都駅')],
    ['wrong platform', fixture().replace('tt-platform-num">1', 'tt-platform-num">2')],
    ['missing hour', fixture().replace('<h3>6</h3>', '<h3>7</h3>')],
    ['missing sequence', fixture().replace('data-no="2"', 'data-no="4"')],
    ['duplicate time', fixture('south', ['04', '04'])],
    ['unsorted time', fixture('south', ['43', '04'])],
  ])('rejects %s rather than guessing', (_, html) => {
    expect(() => parseKyotoHtml(html, 'south')).toThrow();
  });
  it('rejects conflicting direction markup', () => {
    expect(() => parseKyotoHtml(fixture(), 'north')).toThrow('direction');
  });
  it('records individual and top page dates separately', () => {
    expect(readKyotoDates('<span id="pcttdate">令和7年02月22日現在</span>', '<body>令和８（２０２６）年３月１４日（土曜日）以降</body>')).toEqual({ pageAsOf: '2025-02-22', topValidFrom: '2026-03-14' });
    expect(() => readKyotoDates('', '')).toThrow('date');
  });
  it('requires the current official top → line → station → direction chain and reviewed date labels', () => {
    const top = '<body>令和８（２０２６）年３月１４日（土曜日）以降<a href="hyperdia/line02.htm">烏丸線</a></body>';
    const line = '<title>烏丸線</title><a href="menu0216.htm">今出川</a>';
    const station = '<title>今出川</title><a href="021600.htm">南行</a>';
    const direction = '<span id="pcttdate">令和7年02月22日現在</span>';
    expect(validateKyotoCurrentPublication(top, line, station, direction, 'south').basis).toBe('currently-published-official-navigation');
    expect(() => validateKyotoCurrentPublication(top, line.replace('menu0216.htm', 'menu0221.htm'), station, direction, 'south')).toThrow('navigation');
    expect(() => validateKyotoCurrentPublication(top.replace('２０２６', '２０２７'), line, station, direction, 'south')).toThrow('dates changed');
    expect(() => validateKyotoCurrentPublication(top, line, station, direction, 'north')).toThrow('navigation');
  });
  it('enables current published facts without inventing the individual revision date', () => {
    const tables: Timetable[] = JSON.parse(readFileSync(new URL('../src/data/kyoto.json', import.meta.url), 'utf8'));
    expect(tables).toHaveLength(4);
    expect(tables.reduce((n, t) => n + t.departures.length, 0)).toBe(610);
    for (const table of tables) {
      expect(table.verification).toBe('verified');
      expect([table.validFrom, table.validTo, table.revisionDate]).toEqual([null, null, null]);
      expect(table.notes.join(' ')).toContain('現行の公開導線');
      validateKyotoSamples(table.departures, KYOTO_SAMPLE_REVIEW[`${table.directionId}/${table.dayType}`]);
    }
  });
  it('fails changed reviewed first/noon/last/count', () => {
    expect(() => validateKyotoSamples([{ time: '05:00', destination: '竹田' }], ['05:01/竹田', '12:02/新田辺', '23:49/竹田', 1])).toThrow('manual review');
  });
});

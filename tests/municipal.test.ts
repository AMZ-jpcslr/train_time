import { describe, expect, it } from 'vitest';
// JavaScript importer is shared with the command line; no network requests in tests.
// @ts-expect-error importer is a native Node ESM module
import { parseCsv, parseKobeCsv, serviceTime, verifySamples, SOURCE_SAMPLES } from '../scripts/import-municipal.mjs';
import tables from '../src/data/municipal.json';

describe('Kobe municipal CSV parser', () => {
  it('retains destination columns while skipping non-serving trains and crossing midnight', () => {
    const csv = '始発駅,西神中央,名谷,西神中央\r\n行先駅,谷上,新神戸,名谷\r\n学園都市,5:30,,0:50\r\n';
    const parsed = parseKobeCsv(csv, '学園都市');
    expect(parsed.departures).toEqual([
      { time: '05:30', destination: '谷上', trainType: null, platform: null },
      { time: '24:50', destination: '名谷', trainType: null, platform: null },
    ]);
    expect(parsed.sourceColumns).toEqual([2, 4]);
    expect(parsed.emptyCells).toBe(1);
  });
  it('handles quoted commas and escaped quotes without shifting data', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n')).toEqual([['a', 'b,c', 'd"e']]);
    expect(() => parseCsv('a,"open')).toThrow('Unclosed');
  });
  it('rejects broken columns, missing destinations, missing stations, duplicate and unsorted departures', () => {
    expect(() => parseKobeCsv('始発駅,a\n行先駅,b\n学園都市,5:30,6:00', '学園都市')).toThrow('column');
    expect(() => parseKobeCsv('始発駅,a\n行先駅,\n学園都市,5:30', '学園都市')).toThrow('destination');
    expect(() => parseKobeCsv('始発駅,a\n行先駅,b\n名谷,5:30', '学園都市')).toThrow('Station');
    expect(() => parseKobeCsv('始発駅,a,a\n行先駅,b,b\n学園都市,5:30,5:30', '学園都市')).toThrow('Duplicate');
    expect(() => parseKobeCsv('始発駅,a,a\n行先駅,b,b\n学園都市,6:30,5:30', '学園都市')).toThrow('Unsorted');
  });
  it('normalizes early hours only and rejects impossible source times', () => {
    expect(serviceTime('0:17')).toBe('24:17');
    expect(serviceTime('24:17')).toBe('24:17');
    expect(serviceTime('4:01')).toBe('04:01');
    for (const value of ['5:99', '28:00', '5:2', 'unknown']) expect(() => serviceTime(value)).toThrow();
  });
});

describe('reviewed municipal data', () => {
  it('has both directions and both source calendars for both Kobe stations', () => {
    expect(tables).toHaveLength(8);
    expect(tables.reduce((count, table) => count + table.departures.length, 0)).toBe(1318);
    for (const stationId of ['kobe-gakuentoshi', 'kobe-myohoji']) {
      const stationTables = tables.filter(table => table.stationId === stationId);
      expect(stationTables.map(table => `${table.directionId}/${table.dayType}`).sort()).toEqual(['east/weekday', 'east/weekend', 'west/weekday', 'west/weekend']);
    }
  });
  it('matches fixed source first/noon/last samples for every station/direction/calendar', () => {
    for (const table of tables) {
      const name = table.stationId === 'kobe-gakuentoshi' ? '学園都市' : '妙法寺';
      const key = `${table.dayType === 'weekday' ? 'w' : 'h'}-${table.directionId}/${name}`;
      expect(() => verifySamples(table.departures, SOURCE_SAMPLES[key])).not.toThrow();
      expect(table.verification).toBe('verified');
      expect(table.validTo).toBeNull();
      expect(table.notes.join(' ')).toContain('CC BY 2.1 JP');
    }
  });
  it('does not let changed samples silently pass verification', () => {
    expect(() => verifySamples([{time:'05:31',destination:'谷上'}], ['05:30/谷上','12:06/新神戸','24:50/名谷',178])).toThrow('differs');
  });
});

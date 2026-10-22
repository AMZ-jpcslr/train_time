import { describe, expect, it } from 'vitest';
import { dailyRefreshDue, JR_DAILY_TTL_MS, readSavedDaily, selectDailyResult, validDailyResult, type DailyResult, type DailyStatus } from '../src/useTimetables';
import type { Timetable } from '../src/domain/types';
import acquired from '../src/data/jr.json';

const day = '2026-10-22';
const stamp = Date.parse('2026-10-22T03:15:00.000Z');
function result(date = day, retrieved = stamp): DailyResult {
  const tables = (acquired as Timetable[]).filter(t => t.serviceDates?.[0] === day).map(table => ({
    ...structuredClone(table), id: `${table.stationId}-${table.directionId}-${date}`,
    validFrom: date, validTo: date, serviceDates: [date],
    sourceUrl: table.sourceUrl.replace('20261022', date.replaceAll('-', '')),
    retrievedAt: new Date(retrieved).toISOString(), checkedAt: new Date(retrieved).toISOString(),
  }));
  return { schemaVersion: 2, serviceDate: date, tables, status: 'ready', expiresAt: new Date(retrieved + JR_DAILY_TTL_MS).toISOString(), errors: [] };
}
describe('JR frontend cache and service-day selection', () => {
  it('stops at the six-hour boundary even when an older bundled copy exists', () => {
    const bundled = result(day, stamp - 3600000).tables, saved = result();
    expect(selectDailyResult(bundled, { [day]: saved }, day, stamp + JR_DAILY_TTL_MS - 1)?.source).toBe('saved');
    expect(selectDailyResult(bundled, { [day]: saved }, day, stamp + JR_DAILY_TTL_MS)).toBeNull();
  });
  it('allows an exact-day bundle offline only inside its actual acquisition window', () => {
    const bundled = result().tables;
    expect(selectDailyResult(bundled, {}, day, stamp + 1000)?.source).toBe('bundled');
    expect(selectDailyResult(bundled, {}, day, stamp + JR_DAILY_TTL_MS)).toBeNull();
    expect(selectDailyResult(bundled, {}, day, stamp - 1)).toBeNull();
  });
  it('never replaces a missing operating day with a different day or weekday pattern', () => {
    const previous = result(), tomorrow = result('2026-10-23');
    const next = selectDailyResult([...previous.tables, ...tomorrow.tables], { [day]: previous }, '2026-10-23', stamp + 1000);
    expect(next?.result.tables.every(t => t.serviceDates?.[0] === '2026-10-23')).toBe(true);
    expect(selectDailyResult(previous.tables, { [day]: previous }, '2026-10-23', stamp + 1000)).toBeNull();
    const patterned = previous.tables.map(t => ({ ...t, serviceDates: undefined }));
    expect(selectDailyResult(patterned, {}, '2026-10-23', stamp + 1000)).toBeNull();
  });
  it('separates a future preview operating day from the real freshness clock', () => {
    const preview = result('2026-10-25');
    expect(selectDailyResult(preview.tables, {}, '2026-10-25', stamp + 60000)?.result.serviceDate).toBe('2026-10-25');
    // Advancing the actual clock expires the cache; merely choosing a preview day does not.
    expect(selectDailyResult(preview.tables, {}, '2026-10-25', stamp + 3 * 86400000)).toBeNull();
  });
  it('blocks both saved and bundled data after an explicit source rejection', () => {
    const saved = result();
    expect(selectDailyResult(saved.tables, { [day]: saved }, day, stamp + 1000, true)).toBeNull();
  });
  it('chooses the newer valid acquisition rather than always preferring localStorage', () => {
    const old = result(day, stamp - 3600000), current = result();
    expect(selectDailyResult(current.tables, { [day]: old }, day, stamp + 1000)?.source).toBe('bundled');
    expect(selectDailyResult(old.tables, { [day]: current }, day, stamp + 1000)?.source).toBe('saved');
  });
  it('requires all eight unique station-directions and rejects mixed dates', () => {
    const duplicated = result(); duplicated.tables[7] = duplicated.tables[0];
    expect(validDailyResult(duplicated, day)).toBe(false);
    const wrongDate = result(); wrongDate.tables[0].serviceDates = ['2026-10-23'];
    expect(validDailyResult(wrongDate, day)).toBe(false);
    expect(selectDailyResult(result().tables.slice(1), {}, day, stamp + 1000)).toBeNull();
  });
  it('does not allow cached metadata to extend the source age or change its date URL', () => {
    const overlong = result(); overlong.expiresAt = '2099-01-01T00:00:00Z';
    expect(validDailyResult(overlong, day)).toBe(false);
    const badUrl = result(); badUrl.tables[0].sourceUrl = badUrl.tables[0].sourceUrl.replace('20261022', '20261023');
    expect(validDailyResult(badUrl, day)).toBe(false);
    const unchecked = result(); unchecked.tables[0].verification = 'partial';
    expect(validDailyResult(unchecked, day)).toBe(false);
  });
  it('rejects corrupted storage, departures and missing provenance without crashing', () => {
    for (const input of [null, '{', 'null', '[]', '{"2026-10-22":null}']) expect(readSavedDaily(input)).toEqual({});
    const bad = result(); bad.tables[0].departures[0].time = '99:00';
    expect(readSavedDaily(JSON.stringify({ [day]: bad }))).toEqual({});
    const missing = result(); missing.tables[0].retrievedAt = '';
    expect(validDailyResult(missing, day)).toBe(false);
    expect(Object.keys(readSavedDaily(JSON.stringify({ [day]: result() })))).toEqual([day]);
  });
  it('rejects pre-correction browser cache even when its date and expiry are fresh', () => {
    expect(validDailyResult({ ...result(), schemaVersion: 1 }, day)).toBe(false);
    const legacy = result();
    delete (legacy.tables[0] as Timetable & { scopeVersion?: number }).scopeVersion;
    expect(validDailyResult(legacy, day)).toBe(false);
  });
});
describe('JR update scheduling', () => {
  const status: DailyStatus = {
    day, phase: 'ready', message: '', rejectCache: false,
    nextAttemptAt: stamp + JR_DAILY_TTL_MS,
  };
  it('refreshes at the real acquisition expiry, not the next fixed six-hour clock boundary', () => {
    expect(dailyRefreshDue(status, day, status.nextAttemptAt - 1)).toBe(false);
    expect(dailyRefreshDue(status, day, status.nextAttemptAt)).toBe(true);
    expect(dailyRefreshDue(status, day, status.nextAttemptAt + 2 * 3600000)).toBe(true);
  });
  it('waits for retryAfter after failure and does not start a second in-flight request', () => {
    const failed = { ...status, phase: 'unavailable' as const, nextAttemptAt: stamp + 15 * 60000 };
    expect(dailyRefreshDue(failed, day, stamp + 60000)).toBe(false);
    expect(dailyRefreshDue(failed, day, stamp + 15 * 60000)).toBe(true);
    expect(dailyRefreshDue({ ...failed, phase: 'loading' }, day, stamp + 20 * 60000)).toBe(false);
  });
  it('does not apply an old operating day request deadline after date switching', () => {
    expect(dailyRefreshDue(status, '2026-10-23', status.nextAttemptAt + 86400000)).toBe(false);
  });
});

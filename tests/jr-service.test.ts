import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Node-only service
import { createJrService } from '../server/jr-service.mjs';
import realTables from '../src/data/jr.json';

const day = '2026-10-22', stamp = '2026-10-22T03:00:00.000Z';
const hour = 60 * 60 * 1000;
const dateEpoch = Date.parse(stamp);
function fixture(date = day, retrievedAt = stamp) {
  const tables = realTables.filter(t => t.serviceDates[0] === day).map(t => ({
    ...structuredClone(t), id: `${t.stationId}-${t.directionId}-${date}`, serviceDates: [date],
    validFrom: date, validTo: date, retrievedAt, checkedAt: retrievedAt, verification: 'verified',
    sourceUrl: t.sourceUrl.replace('20261022', date.replaceAll('-', '')),
  }));
  const evidence = tables.map(t => ({
    id: t.id, sourceUrl: t.sourceUrl, retrievedAt, count: t.departures.length,
    displayedDateMatched: true, pcMobileAllTimesAndPlatformsMatched: true,
    duplicates: 0, sorted: true, scope: { version: 2, sourceCount: t.departures.length, excluded: [] },
  }));
  return { tables, evidence };
}
async function root() { return mkdtemp(path.join(tmpdir(), 'jr-service-')); }
describe('local JR operating-date service', () => {
  it('collapses concurrent requests and persists validated exact-day data', async () => {
    const dir = await root(), loader = vi.fn(async (_date: string, refresh: boolean) => {
      if (!refresh) throw Error('cache absent');
      return fixture();
    });
    const service = createJrService({ root: dir, clock: () => dateEpoch, loader });
    const a = service.getJrTimetables(day), b = service.getJrTimetables(day);
    expect(a).toBe(b);
    const result = await a;
    expect(result.status).toBe('ready'); expect(result.source).toBe('network');
    expect(result.tables).toHaveLength(8); expect(loader).toHaveBeenCalledTimes(2);
    const noFetch = vi.fn(() => { throw Error('should use persisted daily cache'); });
    const restart = createJrService({ root: dir, clock: () => dateEpoch + hour, loader: noFetch });
    const after = await restart.getJrTimetables(day);
    expect(after.source).toBe('cache'); expect(after.fetchedAt).toBe(stamp);
    expect(noFetch).not.toHaveBeenCalled();
  });
  it('reuses CLI raw-cache results without inventing fresh retrieval timestamps', async () => {
    const loader = vi.fn(async () => fixture());
    const service = createJrService({ root: await root(), clock: () => dateEpoch + hour, loader });
    const result = await service.getJrTimetables(day);
    expect(result.source).toBe('cache'); expect(result.fetchedAt).toBe(stamp);
    expect(result.expiresAt).toBe('2026-10-22T09:00:00.000Z');
    expect(loader).toHaveBeenCalledExactlyOnceWith(day, false);
  });
  it('requests a new day independently and rejects any old-day replacement', async () => {
    const loader = vi.fn(async (requested: string, refresh: boolean) => {
      if (!refresh) throw Error('no cache');
      // Simulate a provider silently falling back to today for tomorrow.
      return requested === day ? fixture() : fixture(day);
    });
    const service = createJrService({ root: await root(), clock: () => dateEpoch, loader });
    expect((await service.getJrTimetables(day)).tables).toHaveLength(8);
    const tomorrow = await service.getJrTimetables('2026-10-23');
    expect(tomorrow.status).toBe('unavailable'); expect(tomorrow.tables).toEqual([]);
    expect(tomorrow.errors[0]).toMatch(/date/);
  });
  it('backs off on failure, including after restart, then retries when due', async () => {
    let now = dateEpoch;
    const dir = await root(), loader = vi.fn(async (_day: string, refresh: boolean) => {
      if (!refresh) throw Error('cache absent');
      throw Error('HTTP 503');
    });
    const service = createJrService({ root: dir, clock: () => now, loader });
    const result = await service.getJrTimetables(day);
    expect(result.status).toBe('unavailable'); expect(result.retryAfter).toBe('2026-10-22T03:15:00.000Z');
    await service.getJrTimetables(day);
    const restart = createJrService({ root: dir, clock: () => now, loader });
    await restart.getJrTimetables(day);
    expect(loader.mock.calls.filter(call => call[1])).toHaveLength(1);
    now += 16 * 60 * 1000;
    await restart.getJrTimetables(day);
    expect(loader.mock.calls.filter(call => call[1])).toHaveLength(2);
  });
  it('does not silently serve expired same-day data after a refresh failure', async () => {
    let now = dateEpoch;
    const loader = vi.fn(async (_day: string, refresh: boolean) => {
      if (refresh) throw Error('offline');
      return fixture();
    });
    const service = createJrService({ root: await root(), clock: () => now, loader });
    expect((await service.getJrTimetables(day)).status).toBe('ready');
    now += 7 * hour;
    const expired = await service.getJrTimetables(day);
    expect(expired.status).toBe('unavailable'); expect(expired.tables).toEqual([]);
  });
  it('rejects incomplete direction coverage and unverified source results', async () => {
    const incomplete = fixture(); incomplete.tables.pop();
    const service = createJrService({ root: await root(), clock: () => dateEpoch, loader: async () => incomplete });
    expect((await service.getJrTimetables(day)).errors[0]).toMatch(/coverage/);
    const partial = fixture(); partial.tables[0].verification = 'partial';
    const other = createJrService({ root: await root(), clock: () => dateEpoch, loader: async () => partial });
    expect((await other.getJrTimetables(day)).status).toBe('unavailable');
  });
  it('rejects modified normalized cache and records a fresh failure if sources are unavailable', async () => {
    const dir = await root(), service = createJrService({ root: dir, clock: () => dateEpoch, loader: async () => fixture() });
    await service.getJrTimetables(day);
    const target = path.join(dir, '.cache/jr-service', `${day}.json`);
    const data = JSON.parse(await readFile(target, 'utf8')); data.result.tables[0].departures[0].time = '07:59';
    await writeFile(target, JSON.stringify(data));
    const restart = createJrService({ root: dir, clock: () => dateEpoch, loader: async () => { throw Error('unavailable'); } });
    expect((await restart.getJrTimetables(day)).status).toBe('unavailable');
  });
  it('invalidates pre-scope-fix disk caches and rebuilds from validated source data', async () => {
    const dir = await root(), service = createJrService({ root: dir, clock: () => dateEpoch, loader: async () => fixture() });
    const initial=await service.getJrTimetables(day); expect(initial.schemaVersion).toBe(2);
    const target = path.join(dir, '.cache/jr-service', `${day}.json`);
    const legacy=JSON.parse(await readFile(target,'utf8'));legacy.version=1;await writeFile(target,JSON.stringify(legacy));
    const loader=vi.fn(async()=>fixture());
    const restart=createJrService({root:dir,clock:()=>dateEpoch,loader});
    const rebuilt=await restart.getJrTimetables(day);
    expect(loader).toHaveBeenCalledExactlyOnceWith(day,false);expect(rebuilt.schemaVersion).toBe(2);
    expect(JSON.parse(await readFile(target,'utf8')).version).toBe(2);
  });
  it('validates dates, bounds queries, and accepts previous operating day after midnight', async () => {
    const service = createJrService({ root: await root(), clock: () => Date.parse('2026-10-22T16:00:00Z'), loader: async () => fixture(day, '2026-10-22T15:00:00Z') });
    for (const bad of ['2026-02-30', '../2026-10-22', '2026-10-19', '2026-12-01']) expect(() => service.getJrTimetables(bad)).toThrow();
    expect((await service.getJrTimetables(day)).status).toBe('ready');
  });
});

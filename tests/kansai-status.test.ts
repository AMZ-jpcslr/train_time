import { describe, it, expect } from 'vitest';
import { kansaiDirectionStatus } from '../src/KansaiCoverage';
import type { Timetable } from '../src/domain/types';

const table: Timetable = { id: 'jr-example-east-2026-10-26', stationId: 'jr-example', operator: 'JR西日本', line: 'JR京都線', directionId: 'east', direction: '京都方面',
  dayType: 'weekday', departures: [{ time: '24:10', destination: '京都', trainType: '普通', platform: null }],
  sourceUrl: 'https://example.com/', retrievedAt: '2026-10-26T00:00:00Z', checkedAt: '2026-10-26T00:00:00Z',
  validFrom: '2026-10-26', validTo: '2026-10-26', serviceDates: ['2026-10-26'], revisionDate: null, verification: 'verified', notes: [] };
const now = Date.parse('2026-10-26T01:00:00Z');
const status = (stored: Timetable[], live: Timetable[], day = '2026-10-26', clock = now) => kansaiDirectionStatus(stored, live, 'jr-example', 'east', day, clock);
describe('Kansai status shown in the application', () => {
  it('distinguishes acquisition, verification and the exact usable day', () => {
    expect(status([table], [table])).toMatchObject({ acquired: true, verified: true, ready: true, status: 'ready' });
    expect(status([table], [], '2026-10-27')).toMatchObject({ acquired: true, verified: true, ready: false, status: 'missing' });
  });
  it('does not restore rejected JR data from the bundle or extend its six-hour TTL', () => {
    expect(status([table], [])).toMatchObject({ ready: false, status: 'missing' });
    expect(status([table], [table], '2026-10-26', now + 5 * 3600000)).toMatchObject({ ready: false, status: 'expired' });
  });
  it('separates unverified and unsupported from a real last departure', () => {
    const partial = { ...table, verification: 'partial' as const };
    expect(status([partial], [partial])).toMatchObject({ ready: false, status: 'unverified', label: '参考表示のみ' });
    expect(status([], [])).toMatchObject({ acquired: false, ready: false, label: '時刻表が未対応' });
  });
  it('includes a newly fetched day in the acquired range even when it is absent from the bundle', () => {
    const fresh = { ...table, id: 'jr-example-east-2026-10-27', serviceDates: ['2026-10-27'], validFrom: '2026-10-27', validTo: '2026-10-27' };
    expect(status([table], [fresh], '2026-10-27')).toMatchObject({ acquired: true, ready: true, range: '2026-10-26〜2026-10-27（2日）' });
  });
  it('does not label an unavailable non-JR runtime as usable from its retained bundle', () => {
    const municipal = { ...table, stationId: 'kobe-example', serviceDates: undefined, validTo: null };
    expect(kansaiDirectionStatus([municipal], [], 'kobe-example', 'east', '2026-10-26', now)).toMatchObject({ acquired: true, ready: false, status: 'missing', label: 'この日の時刻表なし' });
  });
});

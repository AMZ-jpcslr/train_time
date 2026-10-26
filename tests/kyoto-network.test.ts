import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Standalone data tools remain JavaScript.
import { parseCsv, csvRecords, serviceTime, activeServices, discoverCsvResources, auditKyotoGtfs } from '../scripts/import-kyoto-network.mjs';

const feed = { feed_start_date: '20260314', feed_end_date: '20270331' };
const calendar = [
  { service_id: 'WEK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260314', end_date: '20270331' },
  { service_id: 'HOL', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '1', sunday: '1', start_date: '20260314', end_date: '20270331' },
];
const exceptions = [{ service_id: 'WEK', date: '20261103', exception_type: '2' }, { service_id: 'HOL', date: '20261103', exception_type: '1' }];
function fixture() {
  return { agency: [{ agency_timezone: 'Asia/Tokyo' }], feed_info: [feed], calendar, calendar_dates: exceptions,
    routes: [{ route_id: 'KAR', route_short_name: '地下鉄烏丸線' }],
    trips: [{ trip_id: 'a', route_id: 'KAR', service_id: 'WEK', direction_id: '1', trip_headsign: '国際会館' }],
    stops: [{ stop_id: 'p', stop_name: '駅A', stop_code: 'K01' }, { stop_id: 'p1', stop_name: '駅A', parent_station: 'p' }, { stop_id: 'q', stop_name: '駅B', stop_code: 'K02' }],
    stop_times: [
      { trip_id: 'a', stop_id: 'p1', stop_sequence: '0', arrival_time: '23:59:00', departure_time: '23:59:00', pickup_type: '0', timepoint: '0' },
      { trip_id: 'a', stop_id: 'q', stop_sequence: '1', arrival_time: '24:02:00', departure_time: '24:02:00', pickup_type: '1', timepoint: '0' },
    ],
  };
}
describe('Kyoto network preflight stays separate from deployable timetables', () => {
  it('parses BOM, quoted commas, escaped quotes, multiline and empty cells', () => {
    expect(parseCsv('\uFEFFa,b,c\r\n"x,y","a""b","line1\nline2"\r\n1,2,')).toEqual([['a','b','c'], ['x,y','a"b','line1\nline2'], ['1','2','']]);
  });
  it.each(['a,b\n"broken', 'a,b\n"x"z,2', 'a,b\nx"y,2'])('rejects malformed CSV %s', input => expect(() => parseCsv(input)).toThrow());
  it('rejects missing/duplicate columns and ragged records', () => {
    for (const text of ['a,a\n1,2', 'a,\n1,2', 'a,b\n1']) expect(() => csvRecords(text)).toThrow();
  });
  it('keeps midnight in the same operating day and validates minutes', () => {
    expect(serviceTime('24:02:00')).toBe(86520);
    expect(serviceTime('00:02:00')).toBe(120);
    expect(() => serviceTime('24:60:00')).toThrow();
    expect(() => serviceTime('28:00:00')).toThrow();
  });
  it('applies actual exceptions and feed bounds, without weekday substitution', () => {
    expect(activeServices(calendar, exceptions, feed, '2026-10-26')).toEqual(['WEK']);
    expect(activeServices(calendar, exceptions, feed, '2026-10-25')).toEqual(['HOL']);
    expect(activeServices(calendar, exceptions, feed, '2026-11-03')).toEqual(['HOL']);
    expect(activeServices(calendar, exceptions, feed, '2026-03-13')).toEqual([]);
    expect(activeServices(calendar, exceptions, feed, '2026-03-14')).toEqual(['HOL']);
    expect(activeServices(calendar, exceptions, feed, '2027-03-31')).toEqual(['WEK']);
    expect(activeServices(calendar, exceptions, feed, '2027-04-01')).toEqual([]);
  });
  it('does not guess direct download URLs or parse a maintenance page as a catalog', () => {
    expect(() => discoverCsvResources('<body>Maintenance</body>')).toThrow();
    expect(discoverCsvResources('<body>京都市営地下鉄時刻表 00692 CC-BY 4.0<a href="/data/a.csv">表</a></body>')).toEqual([{ title: '表', url: 'https://data.city.kyoto.lg.jp/data/a.csv' }]);
  });
  it('counts terminal arrival-only rows separately and blocks approximate boarding advice', () => {
    const result = auditKyotoGtfs(fixture());
    expect(result.counts).toMatchObject({ approximate: 2, boarding: 1, noPickup: 1, afterMidnight: 1, terminalBoarding: 0 });
    expect(result.applicationTablesEmitted).toBe(0);
    expect(result.inventory.every((r: { boardingJudgment: boolean }) => !r.boardingJudgment)).toBe(true);
    expect(result.inventory.find((r: { station: string }) => r.station === '駅B').status).toBe('no-boarding-terminal');
  });
  it('rejects duplicated rows, broken references and within-trip reversal', () => {
    const duplicate = fixture(); duplicate.stop_times.push(duplicate.stop_times[0]);
    expect(() => auditKyotoGtfs(duplicate)).toThrow('Duplicate');
    const missing = fixture(); missing.stop_times[0].stop_id = 'missing';
    expect(() => auditKyotoGtfs(missing)).toThrow('reference');
    const reverse = fixture(); reverse.stop_times[1].arrival_time = reverse.stop_times[1].departure_time = '23:58:00';
    expect(() => auditKyotoGtfs(reverse)).toThrow('decreases');
  });
  it('records the actual 32 station-line / 31 name inventory and 610 comparable Imadegawa facts without promoting GTFS', () => {
    const report = JSON.parse(readFileSync(new URL('../docs/kyoto-expansion-20261026-audit.json', import.meta.url), 'utf8'));
    expect(report.stationLineCount).toBe(32);
    expect(report.physicalStationNameCount).toBe(31);
    expect(report.counts).toMatchObject({ stopTimes: 20092, approximate: 20092, exact: 0 });
    expect(report.parity.every((r: { match: boolean }) => r.match)).toBe(true);
    expect(report.parity.reduce((sum: number, r: { gtfsCount: number }) => sum + r.gtfsCount, 0)).toBe(610);
    expect(report.applicationTablesEmitted).toBe(0);
  });
});

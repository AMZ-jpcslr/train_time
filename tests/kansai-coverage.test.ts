import { describe, expect, it } from 'vitest';
// @ts-expect-error Node maintenance scripts intentionally use native ESM JavaScript.
import { assessDate, inspectTable, diffCoverage, calendarDay, validateDate } from '../scripts/audit-kansai-coverage.mjs';

const holidays = { minYear: 2026, maxYear: 2027, days: { '2026-11-03': '文化の日' } };
const table = {
  id: 'kobe-example-east-weekday', stationId: 'kobe-example', directionId: 'east', dayType: 'weekday',
  validFrom: '2026-03-14', validTo: null, verification: 'verified',
  retrievedAt: '2026-10-26T00:00:00Z', checkedAt: '2026-10-26T00:00:00Z',
  departures: [{ time: '05:00', destination: '終点', trainType: null, platform: null }, { time: '24:10', destination: '終点', trainType: null, platform: null }],
};
const now = Date.parse('2026-10-26T03:00:00Z');
describe('Kansai maintenance audit boundaries', () => {
  it('does not call a producer verified flag evidence of an applicable date', () => {
    expect(assessDate(table, '2026-10-26', now, holidays)).toBe('ready');
    expect(assessDate(table, '2026-10-25', now, holidays)).toBe('wrong-day-type');
    expect(assessDate({ ...table, verification: 'partial' }, '2026-10-26', now, holidays)).toBe('unverified');
  });
  it('does not replace a missing daily JR table with another day', () => {
    const jr = { ...table, stationId: 'jr-example', serviceDates: ['2026-10-25'] };
    expect(assessDate(jr, '2026-10-26', now, holidays)).toBe('missing-date');
    expect(assessDate({ ...jr, serviceDates: ['2026-10-26'] }, '2026-10-26', now + 3 * 3600000, holidays)).toBe('expired');
  });
  it('distinguishes revision, future timestamps, stale records, New Year and unknown holiday calendar', () => {
    expect(assessDate({ ...table, validFrom: '2026-10-27' }, '2026-10-26', now, holidays)).toBe('outside-period');
    expect(assessDate({ ...table, validTo: '2026-10-25' }, '2026-10-26', now, holidays)).toBe('outside-period');
    expect(assessDate(table, '2026-10-26', now - 4 * 3600000, holidays)).toBe('expired');
    expect(assessDate(table, '2026-10-26', now + 31 * 86400000, holidays)).toBe('expired');
    expect(assessDate(table, '2026-12-31', now, holidays)).toBe('special');
    expect(assessDate(table, '2028-02-01', now, holidays)).toBe('calendar-unknown');
  });
  it('keeps Saturday and holiday independent and honors explicit exceptional dates', () => {
    expect(calendarDay('2026-10-31', holidays)).toBe('saturday');
    expect(calendarDay('2026-11-03', holidays)).toBe('holiday');
    expect(assessDate({ ...table, dayType: 'weekend' }, '2026-11-03', now, holidays)).toBe('ready');
    expect(assessDate({ ...table, excludedDates: ['2026-10-26'] }, '2026-10-26', now, holidays)).toBe('special');
    expect(assessDate({ ...table, serviceDates: ['2026-12-31'] }, '2026-12-31', now, holidays)).toBe('ready');
  });
  it('validates service-day 24+ times, rejects raw next-day 00 times, missing, duplicate and unordered facts', () => {
    expect(inspectTable(table)).toEqual([]);
    expect(inspectTable({ ...table, departures: [{ ...table.departures[0], time: '00:10' }] })).toContain('invalid-service-time');
    expect(inspectTable({ ...table, departures: [{ ...table.departures[0], time: '28:00' }] })).toContain('invalid-service-time');
    expect(inspectTable({ ...table, departures: [] })).toEqual(['empty']);
    expect(inspectTable({ ...table, departures: [table.departures[1], table.departures[0], table.departures[0]] })).toEqual(['unsorted', 'duplicate-departure']);
    expect(inspectTable({ ...table, departures: [{ ...table.departures[0], destination: '' }] })).toContain('missing-destination');
  });
  it('reports facts, edition and wiring differences without treating re-audit clocks as fact changes', () => {
    const a = { id: 'a', factsSha256: 'x', revisionDate: '2026-03-14', connected: false, checkedAt: 'old' };
    expect(diffCoverage({ tables: [a] }, { tables: [{ ...a, checkedAt: 'new' }] })).toEqual({ added: [], removed: [], changed: [] });
    expect(diffCoverage({ tables: [a, { id: 'gone' }] }, { tables: [{ ...a, connected: true }, { id: 'new' }] })).toMatchObject({ added: ['new'], removed: ['gone'], changed: [{ id: 'a', fields: ['connected'] }] });
  });
  it('rejects normalized but impossible dates', () => {
    expect(() => validateDate('2026-02-30')).toThrow();
    expect(() => validateDate('2026-10-26')).not.toThrow();
  });
});

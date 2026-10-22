import { describe, expect, it } from 'vitest';
// @ts-ignore Node-only acquisition script has no declaration file.
import { serviceTime, parseJrHtml, discoverJrLinks, verifySamples, REVIEWED, currentJrServiceDate, applyJrScope } from '../scripts/import-jr.mjs';
import realTables from '../src/data/jr.json';
import evidence from '../docs/jr-validation.json';

// Synthetic parser fixture only. Never bundled into real timetable data.
const station = { name: '試験', routes: [['east', '試験線', '東方面']] };
const route = { line: '試験線', direction: '東方面' };
const day = '2026-10-22';
function fixture(times = ['5:01', '12:02', '0:03']) {
  const pc = times.map((t, i) => `<tr class="body-row"><td class="hour">${t.split(':')[0]}</td><td><div class="minute-item"><a href="/train-timetable/${i}?date=20261022"><span class="minute">${t.split(':')[1]}</span><span class="platform_number">8</span></a></div></td></tr>`).join('');
  const sp = times.map((t, i) => `<div class="minute-item"><a href="/train-timetable/${i}?date=20261022"><div class="mark"></div><div class="departure-time">${t}</div><div class="train-name"><span>普通</span><span>（試験注記）</span></div><div class="destination">試験終点行（試験経由）</div><div class="platform-no">のりば[8]</div></a></div>`).join('');
  return `<div class="route-name01">試験駅</div><div class="route-name02">試験線</div><div class="route-name03">東方面</div><div class="select-date"><span class="emphasis">2026年10月22日(木)</span></div><select id="date"><option selected value="20261022">2026年10月22日(木)</option></select><div class="time-tbl-annotation">午前4時台から翌日午前3時台</div><div class="revision-date">改正日:2026年10月03日</div><div class="pc-time-tbl-wrap"><table>${pc}</table></div><div class="sp-time-tbl-wrap">${sp}</div>`;
}
describe('JR date-specific public HTML parser', () => {
  it('uses the actual JST operating date instead of a hard-coded initial day', () => {
    expect(currentJrServiceDate(Date.parse('2026-10-24T03:59:59+09:00'))).toBe('2026-10-23');
    expect(currentJrServiceDate(Date.parse('2026-10-24T04:00:00+09:00'))).toBe('2026-10-24');
  });
  it('keeps service-day midnight, destination via, actual train type, notes and platform', () => {
    const result = parseJrHtml(fixture(), station, route, day);
    expect(result.departures.map((d: {time:string}) => d.time)).toEqual(['05:01','12:02','24:03']);
    expect(result.departures[0]).toEqual({ time:'05:01', destination:'試験終点（試験経由）', trainType:'普通', notes:['（試験注記）'], platform:'8' });
    expect(result.revisionDate).toBe('2026-10-03');
  });
  it('uses source day label for Saturday / holiday', () => {
    expect(parseJrHtml(fixture().replaceAll('(木)','(土)'), station, route, day).dayType).toBe('saturday');
    expect(parseJrHtml(fixture().replaceAll('(木)','(祝)'), station, route, day).dayType).toBe('holiday');
  });
  it.each(['28:00','12:60','12:0','-1:00'])('rejects malformed time %s', value => expect(() => serviceTime(value)).toThrow());
  it('rejects another day, station, direction, or service boundary', () => {
    expect(() => parseJrHtml(fixture(), station, route, '2026-10-23')).toThrow(/date/);
    expect(() => parseJrHtml(fixture(), {name:'別駅'}, route, day)).toThrow(/Station/);
    expect(() => parseJrHtml(fixture(), station, {...route,direction:'西方面'}, day)).toThrow(/direction/);
    expect(() => parseJrHtml(fixture().replace('午前4時台','午前5時台'), station, route, day)).toThrow(/boundary/);
  });
  it('fails closed on unknown conditional marker / missing destination / type', () => {
    expect(() => parseJrHtml(fixture().replace('<div class="mark"></div>','<div class="mark">臨</div>'), station, route, day)).toThrow(/marker/);
    expect(() => parseJrHtml(fixture().replace('試験終点行（試験経由）',''), station, route, day)).toThrow(/destination/);
    expect(() => parseJrHtml(fixture().replace('<span>普通</span><span>（試験注記）</span>',''), station, route, day)).toThrow(/type/);
  });
  it('accepts only a documented other-date caution and retains its meaning', () => {
    const marked = fixture().replace('<div class="mark"></div>', '<div class="mark">◆</div>');
    expect(() => parseJrHtml(marked, station, route, day)).toThrow(/marker/);
    const documented = marked + '<div class="notes-column">◆斜字 = 表示の月日以外では、運転していない、または行先・時刻などが変更となる場合があります</div>';
    expect(parseJrHtml(documented, station, route, day).departures[0].notes.at(-1)).toContain('この運行日以外');
  });
  it('does not trust a query string when the displayed date falls back to another day', () => {
    expect(() => parseJrHtml(fixture().replace('<span class="emphasis">2026年10月22日(木)</span>', '<span class="emphasis">2026年10月23日(金)</span>'), station, route, day)).toThrow(/Displayed/);
  });
  it('rejects differing desktop / mobile times, duplicate links, and unsorted rows', () => {
    expect(() => parseJrHtml(fixture().replace('<span class="minute">01</span>','<span class="minute">02</span>'), station, route, day)).toThrow(/mismatch/);
    expect(() => parseJrHtml(fixture().replaceAll('/train-timetable/1?','/train-timetable/0?'), station, route, day)).toThrow(/Duplicate/);
    expect(() => parseJrHtml(fixture(['12:02','5:01']), station, route, day)).toThrow(/Unsorted/);
  });
  it('discovers only the requested line/direction from the selected-date index', () => {
    const html = '<select id="dateSelector"><option selected value="2026-10-22"></option></select><table class="timetable"><tr><th>試験線</th><td><a onclick="link(123)">東方面</a><a onclick="link(456)">西方面</a></td></tr></table>';
    expect(discoverJrLinks(html, station, day)).toEqual([{ directionId:'east',line:'試験線',direction:'東方面',providerId:'123',url:'https://timetable.jr-odekake.net/station-timetable/123?date=20261022' }]);
    expect(() => discoverJrLinks(html,station,'2026-10-23')).toThrow(/date/);
    expect(() => discoverJrLinks(html.replace('試験線','対象外線'),station,day)).toThrow(/Missing/);
  });
});
describe('acquired JR data', () => {
  const tables = realTables.filter(t => t.serviceDates.includes(day));
  it('retains the initial 4 stations / 8 directions and independently reviewed day', () => {
    expect(tables).toHaveLength(8);
    expect(tables.reduce((n,t) => n+t.departures.length,0)).toBe(1702);
    for (const t of tables) {
      expect(t.serviceDates).toEqual([day]); expect(t.validFrom).toBe(day); expect(t.validTo).toBe(day);
      expect(t.verification).toBe('verified'); expect(t.revisionDate).toBe('2026-10-03');
      const id = new URL(t.sourceUrl).pathname.split('/').at(-1)!;
      expect(() => verifySamples(t.departures, REVIEWED[id])).not.toThrow();
    }
  });
  it.each([
    ['2026-10-23', 1702, 'weekday'],
    ['2026-10-24', 1577, 'saturday'],
    ['2026-10-25', 1577, 'holiday'],
  ])('preserves separately acquired public data for %s without weekday generalization', (date, count, dayType) => {
    const acquired = realTables.filter(t => t.serviceDates[0] === date);
    expect(acquired).toHaveLength(8);
    expect(acquired.reduce((sum, t) => sum + t.departures.length, 0)).toBe(count);
    for (const table of acquired) {
      expect(table.verification).toBe('verified'); expect(table.dayType).toBe(dayType);
      expect(table.serviceDates).toEqual([date]);
      expect(new URL(table.sourceUrl).searchParams.get('date')).toBe(String(date).replaceAll('-', ''));
    }
    if (dayType !== 'weekday') expect(acquired.some(t => t.departures.some(d => 'notes' in d && d.notes?.some(note => note.startsWith('◆'))))).toBe(true);
  });
  it('retains compound destinations and only the selected Osaka corridor', () => {
    expect(tables.some(t => t.departures.some(d => d.destination.includes('米原・敦賀')))).toBe(true);
    expect(tables.filter(t => t.stationId==='jr-osaka').map(t=>t.line).sort()).toEqual(['JR京都線(快速・普通)','JR神戸線(快速・普通)']);
    expect(tables.some(t => t.departures.some(d => d.time.startsWith('24:')))).toBe(true);
    expect(realTables.filter(t => t.stationId === 'jr-osaka' && t.directionId === 'west').every(t => t.departures.every(d => !['宝塚','新三田'].includes(d.destination)))).toBe(true);
    // The same destination is relevant while departing on the JR Kyoto line at Ibaraki.
    expect(realTables.filter(t => t.stationId === 'jr-ibaraki').some(t => t.departures.some(d => d.destination === '新三田'))).toBe(true);
  });
  it('detects count or first/last sample damage', () => {
    const t=tables[0], id=new URL(t.sourceUrl).pathname.split('/').at(-1)!;
    expect(() => verifySamples(t.departures.slice(1),REVIEWED[id])).toThrow(/reviewed/);
    const altered=structuredClone(t.departures); altered[0].destination='誤り';
    expect(() => verifySamples(altered,REVIEWED[id])).toThrow(/reviewed/);
  });
});
describe('Osaka JR Kobe corridor scoping after complete source validation', () => {
  const station = { id: 'jr-osaka' }, route = { directionId: 'west', line: 'ＪＲ神戸線（快速・普通）' };
  const departure = (destination: string, time: string) => ({ time, destination, trainType:'普通', platform:'6' });
  const raw = { departures: [departure('西明石','14:12'), departure('宝塚','14:15'), departure('新三田','14:30'), departure('尼崎','14:45')], departureLinks: ['https://example.invalid/1','https://example.invalid/2','https://example.invalid/3','https://example.invalid/4'] };
  it('excludes only the two reviewed Takarazuka branch destinations at Osaka west and records the source trains', () => {
    const scoped = applyJrScope(raw,station,route);
    expect(scoped.departures.map((d: {destination:string}) => d.destination)).toEqual(['西明石','尼崎']);
    expect(raw.departures).toHaveLength(4);
    expect(scoped.scope.sourceCount).toBe(4); expect(scoped.scope.version).toBe(2);
    expect(scoped.scope.excluded.map((d: {destination:string}) => d.destination)).toEqual(['宝塚','新三田']);
    expect(scoped.scope.excluded[0].sourceTrainUrl).toBe('https://example.invalid/2');
    expect(scoped.scope.excluded[0].routeEvidenceUrl).toContain('/172201?date=20261023');
  });
  it('does not filter through destinations at Ibaraki or JR Nishinomiya', () => {
    expect(applyJrScope(raw,{id:'jr-ibaraki'},route).departures).toEqual(raw.departures);
    const east = { departures:[departure('放出','14:00'),departure('四条畷','14:10')], departureLinks:[] };
    expect(applyJrScope(east,{id:'jr-nishinomiya'},{directionId:'east',line:'ＪＲ神戸線'}).departures).toEqual(east.departures);
  });
  it('stops for an unreviewed Osaka west destination rather than guessing its route', () => {
    expect(() => applyJrScope({departures:[departure('未確認終点','14:00')],departureLinks:[]},station,route)).toThrow(/Unreviewed/);
  });
  it('retains complete source and exclusion counts for all four acquired dates', () => {
    for (const date of ['2026-10-22','2026-10-23','2026-10-24','2026-10-25']) {
      const row=evidence.find(t=>t.id===`jr-osaka-west-${date}`)!;
      const weekend=date>='2026-10-24';
      expect(row.scope.sourceCount).toBe(weekend?271:295);
      expect(row.scope.excluded).toHaveLength(weekend?66:57);
      expect(row.count).toBe(weekend?205:238);
      expect(row.count+row.scope.excluded.length).toBe(row.scope.sourceCount);
      expect(row.pcMobileAllTimesAndPlatformsMatched).toBe(true);
    }
  });
});

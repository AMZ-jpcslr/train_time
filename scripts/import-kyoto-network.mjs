/** Kyoto network preflight. Never promotes approximate GTFS times to boarding advice.
 * Existing kyoto.json and the shared GTFS converter are intentionally not mutated.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { load } from 'cheerio';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CATALOG_URL = 'https://data.city.kyoto.lg.jp/dataset/00692/?page=1';
const digest = raw => createHash('sha256').update(raw).digest('hex');
const iso = compact => {
  if (!/^\d{8}$/.test(compact)) throw new Error('Invalid calendar date');
  const s = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6)}`;
  if (new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error('Invalid calendar date');
  return s;
};

/** RFC4180 cells; no guessed schema, delimiter, symbols or flattened multiline cells. */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error('Malformed CSV quote');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        rows.push(row); row = [];
      }
    } else {
      if (closed) throw new Error('Characters after CSV quote');
      cell += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

export function csvRecords(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header?.length || header.some(x => !x) || new Set(header).size !== header.length) throw new Error('Missing or duplicate CSV columns');
  return rows.filter(row => row.some(Boolean)).map(row => {
    if (row.length !== header.length) throw new Error('CSV column count mismatch');
    return Object.fromEntries(header.map((key, i) => [key, row[i]]));
  });
}

export function serviceTime(value) {
  if (!/^(?:[01]\d|2[0-7]):[0-5]\d:[0-5]\d$/.test(value)) throw new Error('Invalid service time');
  const [h, m, s] = value.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export function activeServices(calendar, exceptions, feed, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid query date');
  if (date < iso(feed.feed_start_date) || date > iso(feed.feed_end_date)) return [];
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${date}T00:00:00Z`).getUTCDay()];
  const result = new Set(calendar.filter(c => date >= iso(c.start_date) && date <= iso(c.end_date) && c[weekday] === '1').map(c => c.service_id));
  for (const e of exceptions) {
    if (!['1', '2'].includes(e.exception_type)) throw new Error('Unknown calendar exception');
    if (iso(e.date) !== date) continue;
    if (e.exception_type === '1') result.add(e.service_id); else result.delete(e.service_id);
  }
  return [...result].sort();
}

export function discoverCsvResources(html) {
  const $ = load(html), body = $('body').text().normalize('NFKC');
  if (!body.includes('京都市営地下鉄時刻表') || !body.includes('00692') || !/CC.?BY\s*4\.0/i.test(body)) throw new Error('Expected official Kyoto catalog and CC BY 4.0 license; inspect response');
  // Resource pages and script-driven downloads must be reviewed rather than guessed.
  return $('a[href]').toArray().map(a => ({ title: $(a).text().trim(), url: new URL($(a).attr('href'), CATALOG_URL).href }))
    .filter(a => /\.csv(?:\?|$)/i.test(a.url));
}

export function readGtfs(raw) {
  if (raw.length > 10_000_000) throw new Error('Oversized Kyoto archive');
  const files = unzipSync(raw, { filter: entry => entry.originalSize <= 20_000_000 && /^(agency|stops|routes|trips|stop_times|calendar|calendar_dates|feed_info)\.txt$/.test(entry.name) });
  const data = {};
  for (const name of ['agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar', 'calendar_dates', 'feed_info']) {
    if (!files[`${name}.txt`]) throw new Error(`Missing GTFS file ${name}`);
    data[name] = csvRecords(new TextDecoder('utf-8', { fatal: true }).decode(files[`${name}.txt`]));
  }
  return data;
}

export function auditKyotoGtfs(data, { date = '2026-10-26', existingTables = [] } = {}) {
  if (data.agency.some(a => a.agency_timezone !== 'Asia/Tokyo')) throw new Error('Unexpected timezone');
  const index = (rows, key) => {
    if (new Set(rows.map(r => r[key])).size !== rows.length) throw new Error(`Duplicate ${key}`);
    return new Map(rows.map(r => [r[key], r]));
  };
  const stops = index(data.stops, 'stop_id'), routes = index(data.routes, 'route_id'), trips = index(data.trips, 'trip_id');
  if ([...routes.keys()].some(id => !['KAR', 'TOZ'].includes(id))) throw new Error('Unknown Kyoto route; review direction mapping');
  const serviceIds = new Set([...data.calendar, ...data.calendar_dates].map(c => c.service_id));
  if ([...trips.values()].some(t => !['0', '1'].includes(t.direction_id) || !serviceIds.has(t.service_id))) throw new Error('Unknown direction or service calendar');
  if (data.feed_info.length !== 1) throw new Error('Expected one feed_info row');
  const feed = data.feed_info[0], active = activeServices(data.calendar, data.calendar_dates, feed, date);
  const counts = { stopTimes: 0, approximate: 0, exact: 0, boarding: 0, noPickup: 0, afterMidnight: 0, terminalBoarding: 0 };
  const groups = new Map(), ordered = new Map(), seen = new Set();
  for (const row of data.stop_times) {
    const trip = trips.get(row.trip_id), stop = stops.get(row.stop_id);
    if (!trip || !stop || !routes.has(trip.route_id)) throw new Error('Broken GTFS reference');
    if (!/^(0|[1-9]\d*)$/.test(row.stop_sequence)) throw new Error('Invalid stop sequence');
    const key = `${row.trip_id}/${row.stop_sequence}`;
    if (seen.has(key)) throw new Error('Duplicate trip stop sequence'); seen.add(key);
    if (!['0', '1', ''].includes(row.timepoint)) throw new Error('Unknown timepoint');
    if (!['0', '1', '2', '3', ''].includes(row.pickup_type)) throw new Error('Unknown pickup_type');
    const sec = serviceTime(row.departure_time), arrival = serviceTime(row.arrival_time);
    if (sec < arrival) throw new Error('Departure before arrival');
    if (!ordered.has(row.trip_id)) ordered.set(row.trip_id, []);
    ordered.get(row.trip_id).push({ row, sec, arrival });
    counts.stopTimes++; counts[row.timepoint === '0' ? 'approximate' : 'exact']++;
    if (sec >= 86400) counts.afterMidnight++;
    if (stop.parent_station && !stops.has(stop.parent_station)) throw new Error('Missing parent station');
    const parent = stops.get(stop.parent_station) ?? stop;
    const gkey = `${trip.route_id}/${parent.stop_id}/${trip.direction_id}/${trip.service_id}`;
    if (!groups.has(gkey)) groups.set(gkey, { routeId: trip.route_id, line: routes.get(trip.route_id).route_short_name, stationSourceId: parent.stop_id,
      station: parent.stop_name, code: parent.stop_code, directionId: trip.direction_id,
      direction: trip.route_id === 'KAR' ? (trip.direction_id === '1' ? '国際会館方面' : '竹田・新田辺・近鉄奈良方面') : (trip.direction_id === '1' ? '六地蔵・びわ湖浜大津方面' : '太秦天神川方面'), serviceId: trip.service_id,
      sourceUrl: parent.stop_url, boardingCount: 0, noPickupCount: 0, approximateCount: 0, times: [] });
    const group = groups.get(gkey);
    if (row.pickup_type !== '' && row.pickup_type !== '0') { counts.noPickup++; group.noPickupCount++; continue; }
    counts.boarding++; group.boardingCount++; if (row.timepoint === '0') group.approximateCount++;
    group.times.push({ time: row.departure_time, destination: trip.trip_headsign, platform: stop.platform_code || null });
  }
  for (const times of ordered.values()) {
    times.sort((a, b) => Number(a.row.stop_sequence) - Number(b.row.stop_sequence));
    for (let i = 1; i < times.length; i++) if (times[i].arrival < times[i - 1].sec) throw new Error('Time decreases within trip');
    if (['', '0'].includes(times.at(-1).row.pickup_type)) counts.terminalBoarding++;
  }
  const parity = existingTables.map(table => {
    const group = groups.get(`KAR/0216/${table.directionId === 'north' ? '1' : '0'}/${table.dayType === 'weekday' ? 'WEK' : 'HOL'}`);
    if (!group) throw new Error('Missing Imadegawa comparison group');
    const fact = d => `${d.time}/${d.destination}/${d.trainType}/${d.platform}`;
    const source = group.times.map(d => fact({ time: d.time.endsWith(':00') ? d.time.slice(0, 5) : d.time,
      destination: d.destination.replace(/^\[急行\]\s*/, ''), trainType: d.destination.startsWith('[急行]') ? '急行' : '普通', platform: d.platform }));
    const current = table.departures.map(fact);
    const missing = current.filter(x => !source.includes(x)), extra = source.filter(x => !current.includes(x));
    return { tableId: table.id, htmlCount: current.length, gtfsCount: source.length, missing, extra, match: !missing.length && !extra.length && current.length === source.length,
      scope: 'time,destination,type,platform; connection notes are not compared; match does not authorize approximate GTFS boarding advice' };
  });
  const inventory = [...groups.values()].sort((a, b) => `${a.code}/${a.directionId}/${a.serviceId}`.localeCompare(`${b.code}/${b.directionId}/${b.serviceId}`)).map(({ times, ...group }) => ({
    ...group, first: times.map(t => t.time).sort()[0] ?? null, last: times.map(t => t.time).sort().at(-1) ?? null,
    downloaded: true, verifiedForBoarding: false, feedCalendarActiveOnAuditDate: active.includes(group.serviceId),
    validForBoardingToday: false, boardingJudgment: false, csvComparison: 'not-acquired',
    status: group.boardingCount ? 'blocked-approximate-times-and-csv-unavailable' : 'no-boarding-terminal',
  }));
  const stationLines = new Set(inventory.map(g => `${g.routeId}/${g.stationSourceId}`));
  return { auditDate: date, feed, activeServices: active, counts, stationLineCount: stationLines.size,
    physicalStationNameCount: new Set(inventory.map(g => g.station)).size,
    routeCounts: [...routes].map(([id, route]) => ({ routeId: id, name: route.route_short_name, stationLines: new Set(inventory.filter(g => g.routeId === id).map(g => g.stationSourceId)).size })),
    parity, inventory, applicationTablesEmitted: 0 };
}

async function main() {
  const out = path.join(ROOT, '.cache/kyoto-network', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(out, { recursive: true });
  if (process.argv.includes('--refresh-catalog')) {
    const r = await fetch(CATALOG_URL, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
    const raw = Buffer.from(await r.arrayBuffer());
    if (raw.length > 2_000_000) throw new Error('Oversized catalog response');
    await writeFile(path.join(out, 'catalog.raw'), raw);
    const resources = discoverCsvResources(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    await writeFile(path.join(out, 'catalog.json'), JSON.stringify({ sourceUrl: CATALOG_URL, retrievedAt: new Date().toISOString(), sha256: digest(raw), resources }, null, 2));
    console.log(`Catalog preserved at ${out}; ${resources.length} direct CSV links. No data imported; inspect resource pages/columns/license before conversion.`);
    return;
  }
  const csvIndex = process.argv.indexOf('--inspect-csv');
  if (csvIndex >= 0) {
    const filename = process.argv[csvIndex + 1]; if (!filename) throw new Error('--inspect-csv needs a file');
    const raw = await readFile(filename), encoding = process.argv.includes('--shift-jis') ? 'shift-jis' : 'utf-8';
    const rows = parseCsv(new TextDecoder(encoding, { fatal: true }).decode(raw));
    await writeFile(path.join(out, 'csv-structure.json'), JSON.stringify({ sha256: digest(raw), encoding, rowCount: rows.length, widths: [...new Set(rows.map(r => r.length))], firstRows: rows.slice(0, 8), conversion: 'blocked-unreviewed-schema' }, null, 2));
    console.log(`CSV structure only: ${out}. No schema guessed and no timetable emitted.`); return;
  }
  const raw = await readFile(path.join(ROOT, '.cache/kyoto-gtfs/current.zip'));
  const metadata = JSON.parse(await readFile(path.join(ROOT, '.cache/kyoto-gtfs/current.meta.json'), 'utf8'));
  if (metadata.bytes !== raw.length || metadata.status !== 200 || !Number.isFinite(Date.parse(metadata.retrievedAt))) throw new Error('Invalid cached GTFS provenance');
  const existingTables = JSON.parse(await readFile(path.join(ROOT, 'src/data/kyoto.json'), 'utf8'));
  const report = auditKyotoGtfs(readGtfs(raw), { existingTables });
  report.provenance = { ...metadata, sha256: digest(raw), auditedAt: new Date().toISOString(), originalMetadataHadSha256: false,
    catalogUrl: 'https://ckan.odpt.org/dataset/kyoto_municipal_transportation_kyoto_city_subway_gtfs',
    license: '公共交通オープンデータ基本ライセンス and specific terms; challenge2026 limited publication',
    licenseUrl: 'https://developer.odpt.org/terms/data_basic_license.html',
    limitation: 'hash records bytes audited now, not authenticity at original retrieval; no new authenticated GTFS fetch performed' };
  await writeFile(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
  // Fixed review artifact is an explicit export, never an application-data update.
  if (process.argv.includes('--export-review')) await writeFile(path.join(ROOT, 'docs/kyoto-expansion-20261026-audit.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, counts: report.counts, stationLines: report.stationLineCount, physicalStationNames: report.physicalStationNameCount, parity: report.parity.map(p => ({ tableId: p.tableId, match: p.match })), applicationTablesEmitted: 0 }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

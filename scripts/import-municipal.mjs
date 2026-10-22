/** Kobe open-data importer. No network calls occur in the browser application. */
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const KOBE_CATALOG = 'https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/';
const BASE = 'https://kotsu.city.kobe.lg.jp/wp-content/uploads/04_/5lyb5qwt5qac6kab/44kq44o844ox44oz44oh44o844k/';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIONS = [{ name: '学園都市', id: 'kobe-gakuentoshi' }, { name: '妙法寺', id: 'kobe-myohoji' }];

// RFC 4180 quoting is supported; malformed records fail instead of shifting columns.
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function serviceTime(value) {
  if (!/^\d{1,2}:\d{2}$/.test(value)) throw new Error(`Invalid source time: ${value}`);
  let [hour, minute] = value.split(':').map(Number);
  if (hour > 27 || minute > 59) throw new Error(`Out of range time: ${value}`);
  // These source tables list early morning after the preceding evening.
  if (hour < 4) hour += 24;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseKobeCsv(text, stationName) {
  const rows = parseCsv(text);
  if (rows[0]?.[0] !== '始発駅' || rows[1]?.[0] !== '行先駅') throw new Error('Unexpected Kobe header');
  const width = rows[0].length;
  if (rows.some(r => r.length !== width)) throw new Error('CSV column count mismatch');
  const matches = rows.filter(r => r[0] === stationName);
  if (matches.length !== 1) throw new Error(`Station row missing or duplicated: ${stationName}`);
  const departures = [], sourceColumns = [];
  matches[0].slice(1).forEach((value, offset) => {
    if (!value) return; // Train does not reach this station. Never fill a missing cell.
    const column = offset + 1, destination = rows[1][column];
    if (!destination) throw new Error(`Missing destination at column ${column + 1}`);
    departures.push({ time: serviceTime(value), destination, trainType: null, platform: null });
    sourceColumns.push(column + 1); // 1-based source CSV column, including label column.
  });
  if (!departures.length) throw new Error('Empty station timetable');
  const keys = departures.map(d => `${d.time}/${d.destination}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate departure');
  for (let i = 1; i < departures.length; i++) {
    if (departures[i].time < departures[i - 1].time) throw new Error('Unsorted departure times');
  }
  return { departures, sourceColumns, sourceRow: rows.findIndex(r => r[0] === stationName) + 1, emptyCells: width - 1 - departures.length };
}

// Independently transcribed from the downloaded source CSV: first/noon/last.
// On a changed source, fail review instead of silently accepting a new timetable.
export const SOURCE_SAMPLES = {
  'w-east/学園都市': ['05:30/谷上', '12:06/新神戸', '24:50/名谷', 178],
  'w-east/妙法寺': ['05:25/谷上', '12:06/谷上', '24:17/新神戸', 174],
  'w-west/学園都市': ['05:27/西神中央', '12:03/西神中央', '24:59/西神中央', 178],
  'w-west/妙法寺': ['05:45/西神中央', '12:02/西神中央', '24:51/西神中央', 174],
  'h-east/学園都市': ['05:30/新神戸', '12:06/新神戸', '24:22/名谷', 156],
  'h-east/妙法寺': ['05:25/谷上', '12:06/谷上', '23:47/谷上', 151],
  'h-west/学園都市': ['05:27/西神中央', '12:03/西神中央', '24:30/西神中央', 156],
  'h-west/妙法寺': ['05:45/西神中央', '12:02/西神中央', '24:22/西神中央', 151],
};

export function verifySamples(departures, expected) {
  const key = d => `${d.time}/${d.destination}`;
  if (key(departures[0]) !== expected[0] || key(departures.at(-1)) !== expected[2] ||
      !departures.some(d => key(d) === expected[1]) || departures.length !== expected[3]) {
    throw new Error('Timetable differs from reviewed first/noon/last/count samples; review source before updating');
  }
}

const hash = buffer => createHash('sha256').update(buffer).digest('hex');

function validateCacheMetadata(metadata, url, sha256) {
  if (metadata.sourceUrl !== url || metadata.sha256 !== sha256 ||
      typeof metadata.retrievedAt !== 'string' || !Number.isFinite(Date.parse(metadata.retrievedAt))) {
    throw new Error('Municipal cache metadata does not match source URL, SHA-256 or retrieval timestamp; use --refresh.');
  }
  return metadata;
}

export async function readMunicipalCache(target, url, evidencePath) {
  let buffer;
  try { buffer = await readFile(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const sha256 = hash(buffer), metadataPath = `${target}.meta.json`;
  let metadata;
  try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Invalid municipal cache metadata; use --refresh. ${error.message}`);
    let evidence;
    try { evidence = JSON.parse(await readFile(evidencePath, 'utf8')); }
    catch { throw new Error('Municipal cache has no provenance metadata or readable validation evidence; use --refresh.'); }
    const matches = evidence.filter(item => item.sourceUrl === url && item.sha256 === sha256);
    const dates = [...new Set(matches.map(item => item.retrievedAt))];
    if (dates.length !== 1) throw new Error('Municipal cache has no unique URL/SHA-256 provenance match; use --refresh.');
    metadata = validateCacheMetadata({ sourceUrl: url, sha256, retrievedAt: dates[0] }, url, sha256);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  }
  validateCacheMetadata(metadata, url, sha256);
  return { buffer, retrievedAt: metadata.retrievedAt, sha256 };
}

export async function archiveMunicipalCache(cacheDir) {
  const files = (await readdir(cacheDir)).filter(name => /^kobe-[wh]-(east|west)\.csv(?:\.meta\.json)?$/.test(name));
  if (!files.length) return null;
  const archive = path.join(cacheDir, 'history', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(archive, { recursive: true });
  for (const name of files) await copyFile(path.join(cacheDir, name), path.join(archive, name));
  return archive;
}

async function getSource(filename, url, refresh) {
  const target = path.join(ROOT, '.cache/municipal', filename);
  let buffer, retrievedAt;
  if (!refresh) {
    const cached = await readMunicipalCache(target, url, path.join(ROOT, 'docs/municipal-validation.json'));
    if (!cached) throw new Error('No cached source. Use --refresh to verify the official catalog before first download.');
    if (cached) ({ buffer, retrievedAt } = cached);
  }
  if (!buffer) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}. No retry or restriction bypass.`);
    buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 1_000_000) throw new Error('Unexpected source size');
    retrievedAt = new Date().toISOString();
    await writeFile(target, buffer);
    await writeFile(`${target}.meta.json`, JSON.stringify({ sourceUrl: url, sha256: hash(buffer), retrievedAt }, null, 2) + '\n');
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  return { text: new TextDecoder('shift_jis', { fatal: true }).decode(buffer), retrievedAt, sha256: hash(buffer) };
}

export async function importMunicipal({ refresh = false } = {}) {
  await mkdir(path.join(ROOT, '.cache/municipal'), { recursive: true });
  if (refresh) {
    // Preserve previous raw files and their provenance before any network request or replacement.
    await archiveMunicipalCache(path.join(ROOT, '.cache/municipal'));
    const response = await fetch(KOBE_CATALOG, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}; refresh stopped without bypass.`);
    const catalog = await response.text();
    const publishedVersions = [...catalog.matchAll(/open_seishin_[wh]_(?:east|west)_r(\d{6})\.csv/g)].map(match => match[1]);
    if (publishedVersions.some(version => version > '070315')) {
      throw new Error('A newer Seishin-Yamate revision is listed. Review its applicability; never renew old data blindly.');
    }
    for (const day of ['w', 'h']) for (const direction of ['east', 'west']) {
      if (!catalog.includes(`open_seishin_${day}_${direction}_r070315.csv`)) {
        throw new Error('Reviewed CSV is no longer linked by the official catalog. Review the new revision before importing.');
      }
    }
    if (!catalog.includes('2.1')) throw new Error('Catalog license may have changed; review required.');
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  const tables = [], evidence = [];
  for (const day of ['w', 'h']) for (const direction of ['east', 'west']) {
    const filename = `kobe-${day}-${direction}.csv`;
    const url = `${BASE}open_seishin_${day}_${direction}_r070315.csv`;
    const source = await getSource(filename, url, refresh);
    for (const station of STATIONS) {
      const parsed = parseKobeCsv(source.text, station.name);
      const sample = SOURCE_SAMPLES[`${day}-${direction}/${station.name}`];
      verifySamples(parsed.departures, sample);
      // Re-parsing an old cache must never reset the application's freshness guard.
      const checkedAt = source.retrievedAt;
      const id = `${station.id}-${direction}-${day === 'w' ? 'weekday' : 'weekend'}`;
      tables.push({ id, stationId: station.id, operator: '神戸市交通局', line: '西神・山手線',
        directionId: direction, direction: direction === 'east' ? '三宮・新神戸・谷上方面' : '西神中央方面',
        dayType: day === 'w' ? 'weekday' : 'weekend', departures: parsed.departures,
        sourceUrl: url, retrievedAt: source.retrievedAt, checkedAt,
        validFrom: '2025-03-15', validTo: null, revisionDate: '2025-03-15', verification: 'verified',
        notes: [
          `神戸市交通局「地下鉄オープンデータ」を加工。CC BY 2.1 JP。${KOBE_CATALOG}`,
          'https://creativecommons.org/licenses/by/2.1/jp/',
          'CSV の駅行と行先駅行を同じ列で対応付け。0時台を前運行日の24時台へ正規化。種別・ホームは原CSVにないため未取得。',
          '検証範囲：2駅×2方面×平日/土曜休日の始発・12時台・終電の時刻/行先、および全件の形式・列数・欠損・重複・時刻順。全便の別資料突合は未実施。',
          '公式カタログ掲載の西神・山手線2025-03-15改正。適用終了日は未公表。臨時列車・将来の改正・特定日の運行変更は未収録。キャッシュ再解析だけでは確認日を延長しない。',
          '年末年始・お盆等の特定日は別途確認が必要。2025年末の変更を2026年末へ一般化していない。',
        ] });
      const sampleIndices = [0, parsed.departures.findIndex(d => `${d.time}/${d.destination}` === sample[1]), parsed.departures.length - 1];
      evidence.push({ id, sourceUrl: url, sha256: source.sha256, retrievedAt: source.retrievedAt, checkedAt,
        sourceEncoding: 'Shift_JIS', sourceRow: parsed.sourceRow, count: parsed.departures.length,
        emptySourceCells: parsed.emptyCells, missingDestinations: 0, duplicates: 0, sorted: true,
        samples: sampleIndices.map(i => ({ sourceColumn: parsed.sourceColumns[i], ...parsed.departures[i] })),
        sampleReview: 'Source CSV first/noon/last manually transcribed on 2026-10-22; script compares against fixed evidence.' });
    }
  }
  await writeFile(path.join(ROOT, 'src/data/municipal.json'), JSON.stringify(tables, null, 2) + '\n');
  await writeFile(path.join(ROOT, 'docs/municipal-validation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Municipal import: ${tables.length} tables, ${tables.reduce((n, t) => n + t.departures.length, 0)} departures. Sources cached outside public assets.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importMunicipal({ refresh: process.argv.includes('--refresh') }).catch(error => { console.error(error); process.exitCode = 1; });
}

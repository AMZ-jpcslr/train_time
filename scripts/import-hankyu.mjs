/** Public timetable facts importer. Station-link auditing is retained separately. */
import { load } from 'cheerio';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const currentReview = JSON.parse(await readFile(new URL('./reviews/hankyu-current.json', import.meta.url), 'utf8'));

export function validateHankyuCurrentReview(id, sourceUrl, departures, review = currentReview) {
  if (!review || review.revisionDate !== '2025-02-22' || !Number.isFinite(Date.parse(review.checkedAt))) throw new Error('Hankyu current edition review missing');
  const entry = review.tables?.find(t => t.id === id);
  const factsSha256 = sha256(JSON.stringify(departures.map(d => ({ time: d.time, destination: d.destination, trainType: d.trainType, platform: d.platform }))));
  if (!entry || entry.sourceUrl !== sourceUrl || entry.factsSha256 !== factsSha256 || entry.count !== departures.length || entry.sourceSampleVerification !== 'passed') throw new Error('Hankyu facts differ from current edition review; manual review required');
  return { checkedAt: review.checkedAt, revisionDate: review.revisionDate, factsSha256, stationPage: entry.stationPage, meaning: review.meaning };
}
// URLs actually retrieved in this investigation, not generated station/line guesses.
export const HANKYU_PUBLIC_SOURCES = {
  'HK-01_ko_2_h.json': 'https://www.hankyu.co.jp/station/html/HK-01_ko_2_h.html',
  'HK-01_ko_2_w.json': 'https://www.hankyu.co.jp/ch/station/html/HK-01_ko_2_w.html',
  'HK-13_ko_1_h.json': 'https://www.hankyu.co.jp/en/station/html/HK-13_ko_1_h.html',
  'HK-13_ko_1_w.json': 'https://www.hankyu.co.jp/en/station/html/HK-13_ko_1_w.html',
  'HK-13_ko_2_h.json': 'https://www.hankyu.co.jp/station/html/HK-13_ko_2_h.html',
  'HK-13_ko_2_w.json': 'https://www.hankyu.co.jp/ch/station/html/HK-13_ko_2_w.html',
  'HK-16_ko_1_h.json': 'https://www.hankyu.co.jp/en/station/html/HK-16_ko_1_h.html',
  'HK-16_ko_1_w.json': 'https://www.hankyu.co.jp/en/station/html/HK-16_ko_1_w.html',
  'HK-16_ko_2_h.json': 'https://www.hankyu.co.jp/station/html/HK-16_ko_2_h.html',
  'HK-16_ko_2_w.json': 'https://www.hankyu.co.jp/en/station/html/HK-16_ko_2_w.html',
};
const isTableHeader = text => /駅\s+神戸線.*時刻表|Station Kobe Line.*timetable|站神户线.*时刻表/.test(text);
const isTableEnd = text => /本時刻表.*再利用|This timetable.*reuse|本时刻表.*再利用/.test(text);
export const HANKYU_SAMPLE_REVIEW = {
  'HK-13_ko_2_h.json': ['04:50/普通/高速神戸', '12:09/普通/神戸三宮', '24:15/急行/神戸三宮', 116],
  'HK-16_ko_2_h.json': ['04:57/普通/高速神戸', '12:08/特急/新開地', '23:52/急行/新開地', 133],
  'HK-01_ko_2_h.json': ['05:00/普通/新開地', '12:00/特急/新開地', '24:10/区間普通/西宮北口', 203],
  'HK-13_ko_1_w.json': ['05:09/普通/大阪梅田', '12:09/普通/大阪梅田', '24:17/普通/西宮北口', 159],
  'HK-13_ko_1_h.json': ['05:09/普通/大阪梅田', '12:09/普通/大阪梅田', '24:17/普通/西宮北口', 114],
  'HK-13_ko_2_w.json': ['04:50/普通/高速神戸', '12:09/普通/神戸三宮', '24:15/急行/神戸三宮', 152],
  'HK-16_ko_1_w.json': ['05:02/普通/大阪梅田', '12:00/特急/大阪梅田', '24:10/普通/西宮北口', 223],
  'HK-16_ko_1_h.json': ['05:02/普通/大阪梅田', '12:00/特急/大阪梅田', '24:10/普通/西宮北口', 204],
  'HK-16_ko_2_w.json': ['04:57/普通/高速神戸', '12:09/特急/新開地', '23:47/準特急/新開地', 130],
  'HK-01_ko_2_w.json': ['05:00/普通/新開地', '12:00/特急/新開地', '24:10/区間普通/西宮北口', 256],
};
export function validateHankyuSamples(departures, expected) {
  const key = d => `${d.time}/${d.trainType}/${d.destination}`;
  if (departures.length !== expected[3] || key(departures[0]) !== expected[0] || !departures.some(d => key(d) === expected[1]) || key(departures.at(-1)) !== expected[2]) throw new Error('Hankyu source sample changed; manual review required');
}

/** A partial web excerpt cannot establish a complete daily schedule. */
export function validateHankyuSnapshot(snapshot) {
  if (!['web-text-snapshot', 'official-html-text'].includes(snapshot.method) || !Number.isFinite(Date.parse(snapshot.retrievedAt))) throw new Error('Invalid Hankyu snapshot provenance');
  if (!Number.isInteger(snapshot.totalLines) || snapshot.totalLines < 1 || !Array.isArray(snapshot.lines)) throw new Error('Incomplete Hankyu snapshot');
  if (snapshot.lines.some((entry, index) => !Array.isArray(entry) || !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= snapshot.totalLines || typeof entry[1] !== 'string' || (index > 0 && entry[0] <= snapshot.lines[index - 1][0]))) throw new Error('Missing or duplicate Hankyu source lines');
  let start = snapshot.lines.findIndex(entry => isTableHeader(entry[1]));
  const headerFromTitle = start < 0;
  if (headerFromTitle && typeof snapshot.documentTitle === 'string') start = snapshot.lines.findIndex(entry => /^\s*(?:\*\s*)*\d{1,2}\s*(?:時|time|时间)\s*$/.test(entry[1]));
  const end = snapshot.lines.findIndex((entry, index) => index > start && isTableEnd(entry[1]));
  if (start < 0 || end < 0 || snapshot.lines.slice(start, end + 1).some((entry, index) => entry[0] !== snapshot.lines[start][0] + index)) throw new Error('Incomplete Hankyu timetable body');
  const match = snapshot.sourceUrl?.match(/^https:\/\/www\.hankyu\.co\.jp\/(?:en\/|ch\/)?station\/html\/(?:(\d{8})\/)?(HK-\d+)_ko_([12])_([wh])\.html$/);
  if (!match) throw new Error('Unverified Hankyu source URL');
  const station = sources.find(source => source.code === match[2]);
  if (!station || (station.id === 'hankyu-umeda' && match[3] !== '2')) throw new Error('Unsupported Hankyu station/direction');
  const directionId = match[3] === '1' ? 'east' : 'west', dayType = match[4] === 'w' ? 'weekday' : 'weekend';
  if (headerFromTitle) validateHankyuDocumentTitle(snapshot.documentTitle, snapshot.sourceUrl, station, directionId, dayType);
  return { station, directionId, dayType, text: snapshot.lines.map(entry => entry[1]).join('\n'), revisionCandidate: match[1] ? `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6)}` : null, bodyLines: [snapshot.lines[start][0], snapshot.lines[end][0]], headerFromTitle, documentTitle: headerFromTitle ? snapshot.documentTitle : null };
}

export function validateHankyuDocumentTitle(title, sourceUrl, station, directionId, dayType) {
  const value = title.normalize('NFKC');
  if (!title.includes(`(${sourceUrl})`)) throw new Error('Document title/source URL mismatch');
  if (station.id === 'hankyu-sannomiya' && directionId === 'east' && dayType === 'weekday' && value.startsWith('Kobe-sannomiya (Hankyu) Station Kobe Line Osaka-umeda timetable |') && /\/en\/station\/html\/HK-16_ko_1_w\.html$/.test(sourceUrl)) return 'en';
  if (station.id === 'hankyu-umeda' && directionId === 'west' && dayType === 'weekday' && value.startsWith('大阪梅田(阪急Station神户线神户三宫/新开地(工作日)时刻表|') && /\/ch\/station\/html\/HK-01_ko_2_w\.html$/.test(sourceUrl)) return 'zh-Hans';
  throw new Error('Unrecognized Hankyu document title metadata');
}

export function validateHankyuIdentityEvidence(evidence, station, directionId, dayType) {
  if (!evidence || !Number.isFinite(Date.parse(evidence.retrievedAt))) throw new Error('Missing separate Hankyu weekday identity evidence');
  const heading = evidence.heading.normalize('NFKC').replace(/^[#\s]+/, '').trim();
  if (station.id === 'hankyu-sannomiya' && directionId === 'east' && dayType === 'weekday' && evidence.sourceUrl === 'https://www.hankyu.co.jp/ch/station/html/HK-16_ko_1_w.html' && heading === '神户三宫(阪急) 车站神户线大阪梅田方向〈平日〉时刻表') return;
  if (station.id === 'hankyu-umeda' && directionId === 'west' && dayType === 'weekday' && evidence.sourceUrl === 'https://www.hankyu.co.jp/station/html/HK-01_ko_2_w.html' && heading === '大阪梅田(阪急)駅 神戸線 神戸三宮・新開地方面〈平日〉 時刻表') return;
  throw new Error('Hankyu weekday identity evidence mismatch');
}

export const HANKYU_DESTINATION_NAMES = {
  'Osaka-umeda': '大阪梅田', 'Nishinomiya-kitaguchi': '西宮北口', 'Kobe-sannomiya': '神戸三宮',
  'Shinkaichi': '新開地', 'Kosoku-kobe': '高速神戸', 'Sanyo-Himeji': '山陽姫路', 'Higashi-futami': '東二見', 'Shikama': '飾磨', 'Higashi-suma': '東須磨', 'Kasumigaoka': '霞ケ丘',
  '大阪梅田': '大阪梅田', '西宫北口': '西宮北口', '神户三宫': '神戸三宮', '新开地': '新開地', '高速神户': '高速神戸', '山阳姬路': '山陽姫路', '东二见': '東二見', '饰磨': '飾磨', '东须磨': '東須磨', '霞丘': '霞ケ丘',
};
export const HANKYU_TYPE_NAMES = {
  'Local': '普通', 'Rapid Service': '快速', 'Semi-Ltd Exp': '準特急', 'Ltd Exp': '特急', 'Commuter Ltd Exp': '通勤特急', 'Express': '急行',
  // 22:28 Sanyo-Himeji and 23:23 Shikama also checked against the Japanese official table.
  'Sanyo S Limited Express': '山陽S特急',
  '普通': '普通', '区间普通': '区間普通', '普通区间': '区間普通', '快速': '快速', '准特急': '準特急', '特急': '特急', '通勤特急': '通勤特急', '急行': '急行',
};

function normalizeTranslatedHankyu(inputLines, station, directionId, dayType, metadata) {
  let lines = inputLines;
  if (metadata?.documentTitle && !lines.some(isTableHeader)) {
    const language = validateHankyuDocumentTitle(metadata.documentTitle, metadata.sourceUrl, station, directionId, dayType);
    validateHankyuIdentityEvidence(metadata.identityEvidence, station, directionId, dayType);
    // Internal parsing context only. Never write an invented heading back into raw source lines.
    const canonical = language === 'en' ? 'Kobe-sannomiya (Hankyu) Station Kobe Line Osaka-umeda Directions〈Weekdays〉timetable' : '大阪梅田(阪急)站神户线 神户三宫、新开地方向〈平日〉时刻表';
    lines = [canonical, ...lines];
  }
  const headerIndex = lines.findIndex(isTableHeader), header = lines[headerIndex] ?? '';
  if (/駅\s+神戸線/.test(header)) return { lines, originals: [] };
  const en = header.includes('Station Kobe Line'), zh = header.includes('站神户线');
  const stationEn = { 'hankyu-rokko': 'Rokko', 'hankyu-sannomiya': 'Kobe-sannomiya (Hankyu)', 'hankyu-umeda': 'Osaka-umeda (Hankyu)' };
  const stationZh = { 'hankyu-rokko': '六甲', 'hankyu-sannomiya': '神户三宫(阪急)', 'hankyu-umeda': '大阪梅田(阪急)' };
  if (!(en ? header.startsWith(stationEn[station.id] + ' Station ') : zh && header.startsWith(stationZh[station.id] + '站'))) throw new Error('Translated Hankyu station header mismatch');
  if (en) {
    const expectedDirection = directionId === 'east' ? /Kobe Line Osaka-umeda [Dd]irections?/ : /Kobe Line (?:Shinkaichi|Kobe-sannomiya(?:[ ,、・]+Shinkaichi)?) [Dd]irections?/;
    if (!expectedDirection.test(header)) throw new Error('Translated Hankyu direction mismatch');
    if (!(dayType === 'weekday' ? /〈Weekdays〉/ : /(?:〈Saturdays and holidays〉|\(Saturdays and holidays\))/).test(header)) throw new Error('Translated Hankyu day mismatch');
  } else {
    if (!(directionId === 'east' ? /神户线\s*大阪梅田方向/ : /神户线\s*(?:神户三宫(?:、新开地)?|新开地(?:、姬路)?)方向/).test(header)) throw new Error('Translated Hankyu direction mismatch');
    if (!header.includes(dayType === 'weekday' ? '〈平日〉' : '〈周六和节假日〉')) throw new Error('Translated Hankyu day mismatch');
  }
  const originals = [], normalized = [...lines];
  normalized[headerIndex] = `${station.name}駅 神戸線 ${directionId === 'east' ? '大阪梅田' : '新開地'}方面〈${dayType === 'weekday' ? '平日' : '土曜・休日'}〉 時刻表`;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isTableEnd(line)) { normalized[i] = '本時刻表の再利用条件'; break; }
    if (line === 'About the timetable' || line === '关于时刻表') { normalized[i] = '時刻表について'; continue; }
    if (/^\d{1,2}\s*(?:time|时间)$/.test(line)) { normalized[i] = line.replace(/\s*(?:time|时间)$/, '時'); continue; }
    const match = line.match(/^(\d{1,2})(?:Minutes|分钟)\s*\[([^\]]+)\](.+?)ポップアップウィンドウで開く$/);
    if (!match) continue;
    const rawType = match[2].replace(/\s+/g, ' ').trim(), rawDestination = match[3].trim();
    const trainType = HANKYU_TYPE_NAMES[rawType], destination = HANKYU_DESTINATION_NAMES[rawDestination];
    if (!trainType || !destination) throw new Error(`Unknown translated Hankyu type/destination: ${rawType}/${rawDestination}`);
    originals.push({ type: rawType, destination: rawDestination });
    normalized[i] = `${match[1]}分 [${trainType}]${destination}ポップアップウィンドウで開く`;
  }
  return { lines: normalized, originals };
}

export function parseHankyuText(text, station, directionId, dayType, metadata = null) {
  if (!['east', 'west'].includes(directionId) || !['weekday', 'weekend'].includes(dayType)) throw new Error('Unsupported Hankyu direction/day');
  const rawLines = text.normalize('NFKC').split(/\r?\n/).map(line => line.replace(/【\d+†([^】]*)】/g, '$1').replace(/^[\s*#]+/, '').trim());
  const { lines, originals } = normalizeTranslatedHankyu(rawLines, station, directionId, dayType, metadata);
  const headerIndex = lines.findIndex(line => /駅\s+神戸線.*時刻表/.test(line));
  const header = lines[headerIndex] ?? '';
  if (!header.startsWith(station.name + '(阪急)駅 ') && !header.startsWith(station.name + '駅 ')) throw new Error('Hankyu station header mismatch');
  if (!header.includes(dayType === 'weekday' ? '〈平日〉' : '〈土曜・休日〉')) throw new Error('Hankyu day header mismatch');
  if (!(directionId === 'east' ? /神戸線\s+大阪梅田方面/ : /神戸線\s+(?:神戸三宮(?:・新開地)?|新開地(?:・姫路)?)方面/).test(header)) throw new Error('Hankyu direction header mismatch');
  const end = lines.findIndex((line, i) => i > headerIndex && line.startsWith('本時刻表') && line.includes('再利用'));
  if (end < 0) throw new Error('Missing Hankyu timetable end marker');
  const departures = [], types = new Set(['普通', '区間普通', '準急', '急行', '通勤急行', '快速', '快速急行', '準特急', '特急', '通勤特急', '直通特急', '山陽S特急']);
  let hour = null, previousHour = -1, started = false;
  for (const line of lines.slice(headerIndex + 1, end)) {
    const hourMatch = line.match(/^(\d{1,2})時$/);
    if (hourMatch) {
      hour = Number(hourMatch[1]);
      if (hour < 4) hour += 24;
      if (hour < 4 || hour > 27 || hour <= previousHour) throw new Error('Invalid Hankyu service hour order');
      previousHour = hour; started = true; continue;
    }
    if (!started || !line || line === '時刻表について') continue;
    const departure = line.match(/^(\d{1,2})分\s*\[([^\]]+)\]\s*(.+?)ポップアップウィンドウで開く$/);
    if (!departure || hour === null || Number(departure[1]) > 59 || !types.has(departure[2]) || !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ヶケー・]+$/u.test(departure[3])) throw new Error(`Unknown Hankyu departure or annotation: ${line}`);
    departures.push({ time: `${String(hour).padStart(2, '0')}:${departure[1].padStart(2, '0')}`, destination: departure[3], trainType: departure[2], platform: null });
    if (originals.length) {
      const original = originals[departures.length - 1];
      if (!original) throw new Error('Translated Hankyu departure alignment mismatch');
      departures.at(-1).notes = [`原表の種別: ${original.type} / 行先: ${original.destination}`];
    }
  }
  if (!departures.length) throw new Error('No Hankyu departures');
  if (departures.some((d, i) => i > 0 && d.time < departures[i - 1].time)) throw new Error('Unsorted Hankyu departures');
  if (new Set(departures.map(d => `${d.time}/${d.destination}/${d.trainType}`)).size !== departures.length) throw new Error('Duplicate Hankyu departure');
  return departures;
}

/** Convert accessible facts from a normally retrieved document; unsupported markup fails in text parser. */
export function hankyuHtmlToText(html) {
  const $ = load(html);
  $('script,style,noscript').remove();
  if (!/神戸線|Kobe Line|神户线/.test($('h1').text())) throw new Error('Unrecognized Hankyu HTML structure');
  $('br').replaceWith('\n');
  $('h1,h2,h3,p,li,div,td,tr').each((_, element) => { $(element).prepend('\n').append('\n'); });
  return $('body').text();
}

export const sources = [
  { id: 'hankyu-rokko', name: '六甲', operator: '阪急電鉄', url: 'https://www.hankyu.co.jp/station/rokko.html', code: 'HK-13' },
  { id: 'hankyu-sannomiya', name: '神戸三宮', operator: '阪急電鉄', url: 'https://www.hankyu.co.jp/station/sannomiya.html', code: 'HK-16' },
  { id: 'hankyu-umeda', name: '大阪梅田', operator: '阪急電鉄', url: 'https://www.hankyu.co.jp/station/umeda.html/', code: 'HK-01' },
  { id: 'jr-nishinomiya', name: '西宮', operator: 'JR西日本', url: 'https://eki.jr-odekake.net/top?id=0610136' },
  { id: 'jr-osaka', name: '大阪', operator: 'JR西日本', url: 'https://eki.jr-odekake.net/top?id=0610130' },
  { id: 'jr-ibaraki', name: '茨木', operator: 'JR西日本', url: 'https://eki.jr-odekake.net/top?id=0610124' },
  { id: 'jr-minamikusatsu', name: '南草津', operator: 'JR西日本', url: 'https://eki.jr-odekake.net/top?id=0610149' },
];

/** Discover date-stamped Kobe-line links actually present in a station page.
 * A dated path is a revision candidate, not proof it is currently applicable.
 * Unversioned links, other lines and other stations are not silently adopted.
 */
export function discoverHankyuLinks(html, station) {
  const $ = load(html);
  const links = new Map();
  $('a[href]').each((_, element) => {
    let url;
    try { url = new URL($(element).attr('href'), station.url); } catch { return; }
    if (url.origin !== 'https://www.hankyu.co.jp') return;
    const match = url.pathname.match(/^\/station\/html\/(\d{8})\/(HK-\d+)_ko_([12])_([wh])\.html$/);
    if (!match || match[2] !== station.code) return;
    if (station.id === 'hankyu-umeda' && match[3] !== '2') return;
    links.set(url.href, {
      url: url.href,
      revisionCandidate: `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6)}`,
      directionId: match[3] === '1' ? 'east' : 'west',
      dayType: match[4] === 'w' ? 'weekday' : 'weekend',
      applicabilityVerified: false,
    });
  });
  return [...links.values()];
}

export function inspectStation(html, station) {
  const $ = load(html);
  const title = $('title').text().trim();
  if (!title.includes(station.name)) throw new Error(`駅名不一致: expected ${station.name}, received ${title}`);
  const links = station.code ? discoverHankyuLinks(html, station) : $('a[href]')
    .map((_, el) => $(el).attr('href')).get()
    .filter(href => {
      try { return new URL(href).hostname === 'timetable.jr-odekake.net'; } catch { return false; }
    }).map(url => ({ url }));
  return { title, links, importStatus: 'withheld', importedDepartures: 0 };
}

export async function auditSources(fetchImpl = fetch, delayMs = 1200) {
  const results = [];
  for (const source of sources) {
    if (results.length) await new Promise(resolve => setTimeout(resolve, delayMs));
    const retrievedAt = new Date().toISOString();
    try {
      const response = await fetchImpl(source.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const inspected = inspectStation(await response.text(), source);
      results.push({ stationId: source.id, sourceUrl: source.url, retrievedAt, ...inspected });
    } catch (error) {
      results.push({ stationId: source.id, sourceUrl: source.url, retrievedAt, importStatus: 'withheld', importedDepartures: 0, error: String(error.message ?? error) });
    }
  }
  return { mode: 'station-link-audit-only', checkedAt: new Date().toISOString(), results };
}

export async function importHankyu({ refresh = false } = {}) {
  const directory = path.join(ROOT, '.cache/hankyu-web');
  await mkdir(directory, { recursive: true });
  const cachedFilenames = (await readdir(directory)).filter(name => /^HK-\d+_ko_[12]_[wh]\.json$/.test(name));
  const filenames = [...new Set([...cachedFilenames, ...(refresh ? Object.keys(HANKYU_PUBLIC_SOURCES) : [])])].sort();
  if (!filenames.length) throw new Error('No Hankyu public-page snapshots. --audit discovers source links; no timetable is guessed.');
  const archive = path.join(directory, 'history', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  if (refresh) {
    await mkdir(archive, { recursive: true });
    for (const filename of cachedFilenames) await copyFile(path.join(directory, filename), path.join(archive, filename));
  }
  const tables = [], results = [];
  for (const filename of filenames) {
    try {
      let snapshot;
      try { snapshot = JSON.parse(await readFile(path.join(directory, filename), 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT' || !refresh || !HANKYU_PUBLIC_SOURCES[filename]) throw error;
        snapshot = { sourceUrl: HANKYU_PUBLIC_SOURCES[filename] };
      }
      // Validate source identity before any refresh request, even if its old body is incomplete.
      if (!/^https:\/\/www\.hankyu\.co\.jp\/(?:en\/|ch\/)?station\/html\/(?:\d{8}\/)?HK-\d+_ko_[12]_[wh]\.html$/.test(snapshot.sourceUrl)) throw new Error('Unrecognized snapshot URL');
      if (refresh) {
        const response = await fetch(snapshot.sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (!response.ok || response.url !== snapshot.sourceUrl) throw new Error(`Hankyu refresh HTTP ${response.status} or unexpected redirect`);
        const html = await response.text();
        if (html.length > 2_000_000) throw new Error('Unexpected Hankyu response size');
        const lines = hankyuHtmlToText(html).split(/\r?\n/).map((line, index) => [index, line]);
        snapshot = { sourceUrl: snapshot.sourceUrl, retrievedAt: new Date().toISOString(), method: 'official-html-text', lines, totalLines: lines.length, originalHtmlSha256: sha256(html) };
      }
      const source = validateHankyuSnapshot(snapshot);
      let identityEvidence = null;
      if (source.headerFromTitle) {
        const evidenceFilename = filename.replace('.json', source.station.id === 'hankyu-sannomiya' ? '.ch.partial.json' : '.ja.partial.json');
        const raw = await readFile(path.join(directory, 'language-evidence', evidenceFilename), 'utf8'), identity = JSON.parse(raw);
        const headingEntry = identity.lines.find(entry => /神户线.*〈平日〉|神戸線.*〈平日〉/.test(entry[1]));
        if (!headingEntry) throw new Error('Separate weekday identity heading absent');
        identityEvidence = { sourceUrl: identity.sourceUrl, retrievedAt: identity.retrievedAt, heading: headingEntry[1], sourceLine: headingEntry[0], snapshotSha256: sha256(raw), use: 'identity only; no departure times combined' };
        validateHankyuIdentityEvidence(identityEvidence, source.station, source.directionId, source.dayType);
      }
      const departures = parseHankyuText(source.text, source.station, source.directionId, source.dayType, source.headerFromTitle ? { documentTitle: source.documentTitle, sourceUrl: snapshot.sourceUrl, identityEvidence } : null);
      if (HANKYU_SAMPLE_REVIEW[filename]) validateHankyuSamples(departures, HANKYU_SAMPLE_REVIEW[filename]);
      const id = `${source.station.id}-${source.directionId}-${source.dayType}`;
      let current = null;
      try { current = validateHankyuCurrentReview(id, snapshot.sourceUrl, departures); } catch { /* New facts stay partial until their current edition is reviewed. */ }
      const verification = current ? 'verified' : 'partial';
      const checkedAt = current ? [snapshot.retrievedAt, current.checkedAt].sort()[0] : snapshot.retrievedAt;
      const direction = source.directionId === 'east' ? '大阪梅田方面' : source.station.id === 'hankyu-sannomiya' ? '新開地・姫路方面' : '神戸三宮・新開地方面';
      tables.push({ id, stationId: source.station.id, operator: '阪急電鉄', line: '神戸線', directionId: source.directionId, direction, dayType: source.dayType, departures,
        sourceUrl: snapshot.sourceUrl, retrievedAt: snapshot.retrievedAt, checkedAt, validFrom: current?.revisionDate ?? null, validTo: null, revisionDate: current?.revisionDate ?? null, verification, notes: [
          current ? '現行の公式駅ページの通常時刻表導線、2025-02-22改正告知・現在掲載の公式FAQ、原表の構造と始発/日中/終電サンプルを確認。通常ダイヤの徒歩乗車判定に使用します。' : '掲載版の現行適用または既存の版確認記録との一致が未確認。参考表示のみで徒歩乗車判定には使用しません。',
          snapshot.method === 'web-text-snapshot' ? '通常HTTP取得が502のため、web閲覧ツールが取得した公開ページのテキストを保存・解析。取得日時は閲覧取得時点であり元ページ更新日時やキャッシュ生成時刻ではありません。' : '通常HTTPS取得HTMLのテキストから解析。',
          current ? `現行性確認: ${current.stationPage} / https://www.hankyu.co.jp/topics/detail/013718.html 。無日付URLだけで現行と判断せず、同じ駅・方面・曜日の版資料と合わせて確認。` : source.revisionCandidate ? `URLの版候補は${source.revisionCandidate}。これだけを適用開始の根拠にはしません。` : '出典URLには版番号がなく、別途の版確認が必要です。',
          source.headerFromTitle ? `最初の時刻行から末尾条件まで全行連続取得。本文の表題部分が欠けているため、同じURLのweb応答documentTitleで駅・路線・方面を確認し、別言語の同一表IDの公式見出しで平日区分を照合（${identityEvidence.sourceUrl}）。時刻は1つの取得本文だけから抽出。原本文に表題を補作していません。` : '表題から時刻表末尾の利用条件まで連続した全行を取得。',
          '件数・重複・順序と始発/日中/終電を照合。全便を別資料と突合したものではありません。翻訳版は既知辞書のみ変換し原語を各便の注記へ保持。',
          '行楽シーズン・正月等の臨時ダイヤは非対応。ホームは出典テキストにないため不明。',
          '元ページに阪急・駅探の許可を得ない加工・再利用・再配布等を認めない個別条件があります。公開・再配布・継続利用の条件確認は未解決です。https://www.hankyu.co.jp/sitepolicy/',
        ] });
      const noon = departures.find(d => d.time.startsWith('12:'));
      results.push({ id, filename, sourceUrl: snapshot.sourceUrl, retrievedAt: snapshot.retrievedAt, checkedAt, method: snapshot.method, snapshotSha256: sha256(JSON.stringify(snapshot)), timetableBodyLines: source.bodyLines, titleEvidence: source.headerFromTitle ? { method: 'web-response-document-title', title: source.documentTitle, identityEvidence } : { method: 'source-body-heading' }, revisionCandidate: source.revisionCandidate, count: departures.length, duplicates: 0, sorted: true, samples: [departures[0], ...(noon ? [noon] : []), departures.at(-1)], sourceSampleVerification: HANKYU_SAMPLE_REVIEW[filename] ? 'passed' : 'pending', verification, currentApplicability: current ? 'current-official-publication' : 'unverified', currentEditionReview: current });
      if (refresh) await writeFile(path.join(directory, filename), JSON.stringify(snapshot, null, 2) + '\n');
    } catch (error) { results.push({ filename, status: 'not-imported', error: error.message }); }
    if (refresh) await new Promise(resolve => setTimeout(resolve, 1200));
  }
  if (!tables.length) { console.error(JSON.stringify(results, null, 2)); throw new Error('No complete Hankyu timetables; previous output retained.'); }
  let prior = [];
  try { prior = JSON.parse(await readFile(path.join(ROOT, 'src/data/hankyu.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const replacedIds = new Set(tables.map(t => t.id));
  const merged = [...prior.filter(t => !replacedIds.has(t.id)), ...tables].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(path.join(ROOT, 'src/data/hankyu.json'), JSON.stringify(merged, null, 2) + '\n');
  await writeFile(path.join(ROOT, 'docs/hankyu-validation.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Hankyu: ${tables.length} tables (${tables.filter(t => t.verification === 'verified').length} current edition verified) / ${tables.reduce((n, t) => n + t.departures.length, 0)} departures; ${results.filter(r => r.status === 'not-imported').length} snapshots rejected. Failed existing tables retained without refreshing their dates.`);
  return { tables, results };
}

async function main() {
  if (process.argv.includes('--audit')) {
    // Only metadata is emitted. Source HTML and train times are not persisted.
    console.log(JSON.stringify(await auditSources(), null, 2));
    return;
  }
  await importHankyu({ refresh: process.argv.includes('--refresh') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().catch(error => { console.error(error.message); process.exitCode = 1; });

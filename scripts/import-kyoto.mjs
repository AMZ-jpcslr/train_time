/** Extract only timetable facts from the public Kyoto station pages. No page rendering/assets are reused. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { load } from 'cheerio';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const KYOTO_SOURCES = {
  south: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/021600.htm',
  north: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/021601.htm',
  top: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/tikatime.htm',
  semantics: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/js/tt_utility_tika.js',
  line: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/line02.htm',
  station: 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/menu0216.htm',
};
export const KYOTO_SAMPLE_REVIEW = {
  'south/weekday': ['05:28/竹田', '12:02/新田辺', '23:49/竹田', 166],
  'south/weekend': ['05:28/竹田', '12:02/新田辺', '23:49/竹田', 139],
  'north/weekday': ['05:36/国際会館', '12:00/国際会館', '23:58/国際会館', 166],
  'north/weekend': ['05:36/国際会館', '12:00/国際会館', '23:58/国際会館', 139],
};
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

export function readKyotoDates(html, topHtml) {
  const $ = load(html), top = load(topHtml);
  const page = plain($('#pcttdate').text()).match(/令和(\d+)年(\d+)月(\d+)日現在/);
  const current = plain(top('body').text()).match(/(20\d{2})\)年(\d+)月(\d+)日.{0,20}以降/);
  if (!page || !current) throw new Error('Kyoto source date labels changed or are missing; review required.');
  const date = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { pageAsOf: date(Number(page[1]) + 2018, page[2], page[3]), topValidFrom: date(current[1], current[2], current[3]) };
}

/** Follow the currently published official navigation, not the age of an individual page label. */
export function validateKyotoCurrentPublication(topHtml, lineHtml, stationHtml, directionHtml, directionId) {
  const top = load(topHtml), line = load(lineHtml), station = load(stationHtml);
  const linked = ($, base, target) => $('a[href]').toArray().some(a => new URL($(a).attr('href'), base).href === target);
  if (!linked(top, KYOTO_SOURCES.top, KYOTO_SOURCES.line)
    || !linked(line, KYOTO_SOURCES.line, KYOTO_SOURCES.station)
    || !linked(station, KYOTO_SOURCES.station, KYOTO_SOURCES[directionId])) throw new Error('Kyoto current timetable navigation changed; manual review required');
  if (!line('title').text().includes('烏丸線') || !station('title').text().includes('今出川')) throw new Error('Kyoto current navigation station/line mismatch');
  const dates = readKyotoDates(directionHtml, topHtml);
  // This combination was reviewed against the live official chain on 2026-10-22.
  // A future top-page revision cannot silently certify the previous edition.
  if (dates.topValidFrom !== '2026-03-14' || dates.pageAsOf !== '2025-02-22') throw new Error('Kyoto publication dates changed; manual review required');
  return { ...dates, basis: 'currently-published-official-navigation', revisionDate: null };
}

export function parseKyotoHtml(html, directionId) {
  if (!['north', 'south'].includes(directionId)) throw new Error('Unknown Kyoto direction');
  const $ = load(html), south = directionId === 'south';
  if (!$('title').text().includes('烏丸線 今出川駅') || $('.line-name').text().trim() !== '烏丸線') throw new Error('Wrong Kyoto station or line');
  if (!$('#tttab').hasClass(south ? 'direction-down' : 'direction-up')) throw new Error('Wrong Kyoto direction markup');
  const platforms = [...new Set($('.tt-platform-num').map((i, e) => $(e).text().trim()).get())];
  if (platforms.length !== 1 || platforms[0] !== (south ? '1' : '2')) throw new Error('Kyoto platform mismatch');
  const legend = plain($('.note-tt').text());
  if (south && (!legend.includes('急行 近鉄奈良行') || !legend.includes('普通 新田辺行') || !legend.includes('その他は竹田行'))) throw new Error('Kyoto destination legend changed');
  const parsed = [];
  for (const [dayType, rowClass, minuteClass] of [['weekday', 'wektime', 'disptnwek'], ['weekend', 'holtime', 'disptnhol']]) {
    const rows = $(`.tt-print-table tr.${rowClass}`);
    if (rows.length !== 20) throw new Error('Expected complete Kyoto hour rows 5 through 24');
    const departures = [], sourceNumbers = [];
    rows.each((index, row) => {
      const hour = Number($(row).find('h3').text().trim());
      if (hour !== index + 5) throw new Error('Missing or unsorted Kyoto hour row');
      $(row).find(`.${minuteClass}`).each((_, node) => {
        const minuteNode = $(node), value = plain(minuteNode.text());
        const match = value.match(/^(\d{1,2})(新|奈)?$/);
        if (!match || Number(match[1]) > 59) throw new Error(`Unknown Kyoto minute or destination symbol: ${value}`);
        for (const child of minuteNode.find('*').toArray()) {
          const classes = ($(child).attr('class') ?? '').split(/\s+/).filter(Boolean);
          if (classes.some(c => !['tanabe', 'tanabe-super', 'nara', 'nara-super', 'cc'].includes(c))) throw new Error('Unknown Kyoto annotation class');
        }
        const nara = minuteNode.find('.nara').length > 0, tanabe = minuteNode.find('.tanabe').length > 0;
        if ((nara && tanabe) || nara !== (match[2] === '奈') || tanabe !== (match[2] === '新') || (!south && (nara || tanabe))) throw new Error('Kyoto symbol and destination class disagree');
        const time = `${String(hour).padStart(2, '0')}:${match[1].padStart(2, '0')}`;
        const notes = [];
        if (nara) notes.push('竹田駅までは各駅に停車');
        if (minuteNode.find('.cc').length) notes.push('烏丸御池駅で東西線との接続待ち');
        departures.push({ time, destination: nara ? '近鉄奈良' : tanabe ? '新田辺' : south ? '竹田' : '国際会館', trainType: nara ? '急行' : '普通', platform: platforms[0], ...(notes.length ? { notes } : {}) });
        sourceNumbers.push(Number(minuteNode.attr('data-no')));
      });
    });
    if (!departures.length || sourceNumbers.some((n, i) => n !== i + 1)) throw new Error('Missing or duplicated Kyoto departure sequence');
    if (new Set(departures.map(d => `${d.time}/${d.destination}`)).size !== departures.length) throw new Error('Duplicate Kyoto departure');
    if (departures.some((d, i) => i > 0 && d.time < departures[i - 1].time)) throw new Error('Unsorted Kyoto departures');
    parsed.push({ dayType, departures, sourceNumbers });
  }
  return parsed;
}

export function validateKyotoSamples(departures, expected) {
  const key = d => `${d.time}/${d.destination}`;
  if (departures.length !== expected[3] || key(departures[0]) !== expected[0] || key(departures.at(-1)) !== expected[2] || !departures.some(d => key(d) === expected[1])) throw new Error('Kyoto first/noon/last/count differs from reviewed source; manual review required');
}

export function validateKyotoSemantics(source) {
  // Only guard the facts used for legend interpretation. The official JS is never executed or shipped.
  for (const fact of ['direction-down', '烏丸線', '竹田', '国際会館', '新田辺', '近鉄奈良', '普通', '急行', '烏丸御池で東西線との接続待ち']) {
    if (!source.includes(fact)) throw new Error(`Official Kyoto legend semantics changed: ${fact}`);
  }
}

async function readSource(name, refresh) {
  const target = path.join(ROOT, '.cache/kyoto', `${name}.raw`), sourceUrl = KYOTO_SOURCES[name];
  if (!refresh) {
    try {
      const raw = await readFile(target), metadata = JSON.parse(await readFile(target + '.meta.json', 'utf8'));
      if (metadata.sourceUrl !== sourceUrl || metadata.sha256 !== hash(raw) || !Number.isFinite(Date.parse(metadata.retrievedAt))) throw new Error('Kyoto cache provenance mismatch; use --refresh');
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(raw), ...metadata };
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Kyoto cache or provenance missing; use --refresh for explicit network retrieval.');
      throw error;
    }
  }
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Kyoto HTTP ${response.status}; no retry or access-control bypass.`);
  if (response.url !== sourceUrl) throw new Error('Unexpected Kyoto redirect; inspect destination before importing');
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > 1_000_000) throw new Error('Unexpected Kyoto response size');
  const metadata = { sourceUrl, sha256: hash(raw), retrievedAt: new Date().toISOString() };
  await writeFile(target, raw);
  await writeFile(target + '.meta.json', JSON.stringify(metadata, null, 2) + '\n');
  await new Promise(resolve => setTimeout(resolve, 1200));
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(raw), ...metadata };
}

export async function importKyoto({ refresh = false } = {}) {
  await mkdir(path.join(ROOT, '.cache/kyoto'), { recursive: true });
  if (refresh) {
    const archive = path.join(ROOT, '.cache/kyoto/history', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
    await mkdir(archive, { recursive: true });
    for (const name of Object.keys(KYOTO_SOURCES)) for (const suffix of ['.raw', '.raw.meta.json']) {
      try { await copyFile(path.join(ROOT, '.cache/kyoto', name + suffix), path.join(archive, name + suffix)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const top = await readSource('top', refresh), semantics = await readSource('semantics', refresh);
  const line = await readSource('line', refresh), station = await readSource('station', refresh);
  validateKyotoSemantics(semantics.text);
  const tables = [], evidence = [];
  for (const directionId of ['south', 'north']) {
    const source = await readSource(directionId, refresh);
    const dates = validateKyotoCurrentPublication(top.text, line.text, station.text, source.text, directionId);
    const checkedAt = [top, line, station, source].map(s => s.retrievedAt).sort()[0];
    const groups = parseKyotoHtml(source.text, directionId);
    for (const group of groups) {
      const expected = KYOTO_SAMPLE_REVIEW[`${directionId}/${group.dayType}`];
      validateKyotoSamples(group.departures, expected);
      const id = `kyoto-imadegawa-${directionId}-${group.dayType}`;
      tables.push({ id, stationId: 'kyoto-imadegawa', operator: '京都市交通局', line: '烏丸線', directionId,
        direction: directionId === 'south' ? '京都・竹田・近鉄奈良方面' : '北大路・国際会館方面',
        dayType: group.dayType, departures: group.departures, sourceUrl: source.sourceUrl,
        retrievedAt: source.retrievedAt, checkedAt,
        validFrom: null, validTo: null, revisionDate: null, verification: 'verified',
        notes: [
          '京都市交通局の無料公開時刻表から発車時刻・行先・種別・ホーム・注記を抽出したローカル試作。元ページの画像、デザイン、JSコードは配信していません。',
          `公式の${dates.topValidFrom}以降時刻表トップ→烏丸線一覧→今出川駅→両方面時刻表という現行の公開導線を確認し、通常ダイヤとして採用。個別ページの${dates.pageAsOf}現在は別の掲載基準日として保持します。`,
          '全2方面×平日/土曜休日の件数、欠損、重複、順序と始発・12時台・終電の原HTML照合済み。全便を別資料と突合したものではありません。',
          'トップの掲載対象期間は個別表のダイヤ改正日や開始日と同一視せず、revisionDate / validFrom / validTo は null。2026年CSVとの全便独立突合・個別掲載日の更新理由は未確認。',
          'https://www2.city.kyoto.lg.jp/kotsu/tikadia/guide/about.htm',
          'https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html',
          '公式HTMLにはオープンデータとしての再配布許諾を確認できていません。一般公開・再配布・継続取得条件は別途確認が必要です。',
        ] });
      const sampleIndices = [0, group.departures.findIndex(d => `${d.time}/${d.destination}` === expected[1]), group.departures.length - 1];
      evidence.push({ id, sourceUrl: source.sourceUrl, sha256: source.sha256, retrievedAt: source.retrievedAt, ...dates,
        top: { sourceUrl: top.sourceUrl, sha256: top.sha256, retrievedAt: top.retrievedAt },
        currentNavigation: [top, line, station, source].map(s => ({ sourceUrl: s.sourceUrl, sha256: s.sha256, retrievedAt: s.retrievedAt })),
        semantics: { sourceUrl: semantics.sourceUrl, sha256: semantics.sha256, retrievedAt: semantics.retrievedAt },
        count: group.departures.length, missingSequenceNumbers: 0, duplicates: 0, sorted: true,
        samples: sampleIndices.map(i => ({ sourceSequence: group.sourceNumbers[i], ...group.departures[i] })),
        sourceSampleVerification: 'passed', currentApplicability: 'current-official-publication', applicationVerification: 'verified', checkedAt,
      });
    }
  }
  await writeFile(path.join(ROOT, 'src/data/kyoto.json'), JSON.stringify(tables, null, 2) + '\n');
  await writeFile(path.join(ROOT, 'docs/kyoto-validation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Kyoto: ${tables.length} tables / ${tables.reduce((sum, table) => sum + table.departures.length, 0)} source departures; official current publication chain verified.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importKyoto({ refresh: process.argv.includes('--refresh') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

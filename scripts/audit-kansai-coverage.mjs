/** Offline coverage/diff audit. Does not fetch sources or renew verification dates. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const prefixes = /^(kobe-|kyoto-|jr-|hankyu-|hanshin-)/;
const sourcePolicies = {
  kobe: { termsUrl: 'https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/', license: 'CC BY 2.1 JP', status: 'open-data-attribution-required' },
  kyoto: { termsUrl: 'https://data.city.kyoto.lg.jp/dataset/00692/?page=1', license: null, status: 'source-specific; see Kyoto audit' },
  jr: { termsUrl: 'https://www.jr-odekake.net/use/about.html', license: null, status: 'bulk-acquisition-and-redistribution-not-cleared', termsCheckedDate: '2026-10-26' },
  hankyu: { termsUrl: 'https://www.hankyu.co.jp/station/html/HK-13_ko_2_h.html', license: null, status: 'bulk-acquisition-and-redistribution-not-cleared', termsCheckedDate: '2026-10-26' },
  hanshin: { termsUrl: 'https://www.hanshin.co.jp/terms/', license: null, status: 'bulk-acquisition-and-redistribution-not-cleared', termsCheckedDate: '2026-10-26' },
};
export function validateDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw Error('Invalid audit date');
  return day;
}
export function calendarDay(day, holidays) {
  validateDate(day);
  if (+day.slice(0, 4) < holidays.minYear || +day.slice(0, 4) > holidays.maxYear) return null;
  if (day in holidays.days) return 'holiday';
  const dow = new Date(day + 'T12:00:00+09:00').getUTCDay();
  return dow === 0 ? 'holiday' : dow === 6 ? 'saturday' : 'weekday';
}
export function inspectTable(table) {
  const errors = [], seen = new Set();
  let previous = -1;
  if (!Array.isArray(table.departures) || !table.departures.length) return ['empty'];
  for (const d of table.departures) {
    const match = /^(?:0[4-9]|1\d|2[0-7]):[0-5]\d(?::[0-5]\d)?$/.test(d.time);
    const [h, m, s = 0] = String(d.time).split(':').map(Number), seconds = h * 3600 + m * 60 + s;
    if (!match) errors.push('invalid-service-time');
    if (seconds < previous) errors.push('unsorted');
    previous = seconds;
    if (typeof d.destination !== 'string' || !d.destination.trim()) errors.push('missing-destination');
    const key = JSON.stringify([d.time, d.destination, d.trainType, d.platform]);
    if (seen.has(key)) errors.push('duplicate-departure');
    seen.add(key);
  }
  return [...new Set(errors)];
}
export function assessDate(table, day, now, holidays) {
  validateDate(day);
  if (!table) return 'missing';
  if (table.serviceDates && !table.serviceDates.includes(day)) return 'missing-date';
  if (table.excludedDates?.includes(day)) return 'special';
  const md = day.slice(5), actual = calendarDay(day, holidays);
  if (!table.serviceDates && (md >= '12-29' || md <= '01-03')) return 'special';
  if (!table.serviceDates && !actual) return 'calendar-unknown';
  if (!table.serviceDates && table.dayType !== actual && !(table.dayType === 'weekend' && ['saturday', 'holiday'].includes(actual))) return 'wrong-day-type';
  if ((table.validFrom && day < table.validFrom) || (table.validTo && day > table.validTo)) return 'outside-period';
  const ttl = table.stationId.startsWith('jr-') ? 6 * 3600000 : 30 * 86400000;
  const checked = Date.parse(table.checkedAt), retrieved = Date.parse(table.retrievedAt);
  if (!Number.isFinite(checked) || !Number.isFinite(retrieved) || checked > now || retrieved > now || now - checked > ttl || (table.stationId.startsWith('jr-') && now - retrieved >= ttl)) return 'expired';
  if (inspectTable(table).length) return 'invalid-structure';
  return table.verification === 'verified' ? 'ready' : 'unverified';
}

// Read only literal data and imported JSON. Unexpected expressions fail closed.
export async function readLiteralArray(filename, variable) {
  const raw = await readFile(filename, 'utf8');
  const source = ts.createSourceFile(filename, raw, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const bindings = new Map();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.name && statement.moduleSpecifier.text.endsWith('.json')) {
      bindings.set(statement.importClause.name.text, JSON.parse(await readFile(path.resolve(path.dirname(filename), statement.moduleSpecifier.text), 'utf8')));
    }
  }
  function literal(node) {
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind)) return node.kind === ts.SyntaxKind.TrueKeyword;
    if (ts.isIdentifier(node) && bindings.has(node.text)) return bindings.get(node.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(n => ts.isSpreadElement(n) ? literal(n.expression) : [literal(n)]);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
      if (!ts.isPropertyAssignment(p)) throw Error('Unsupported property in ' + variable);
      return [p.name.text, literal(p.initializer)];
    }));
    throw Error('Unsupported expression in ' + variable + ': ' + node.getText(source).slice(0, 80));
  }
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) if (declaration.name.getText(source) === variable) return literal(declaration.initializer);
  }
  throw Error('Missing literal array: ' + variable);
}

export function diffCoverage(before, after) {
  const old = new Map(before.tables.map(t => [t.id, t]));
  const result = { added: [], removed: [], changed: [] };
  for (const table of after.tables) {
    const prior = old.get(table.id); old.delete(table.id);
    if (!prior) result.added.push(table.id);
    else {
      const fields = ['factsSha256', 'sourceUrl', 'revisionDate', 'validFrom', 'validTo', 'serviceDates', 'verification', 'connected'];
      const changed = fields.filter(k => JSON.stringify(prior[k]) !== JSON.stringify(table[k]));
      if (changed.length) result.changed.push({ id: table.id, fields: changed, beforeCount: prior.departureCount, afterCount: table.departureCount });
    }
  }
  result.removed = [...old.keys()];
  if(before.catalogOnlyStations||after.catalogOnlyStations){
    const previous=new Map((before.catalogOnlyStations??[]).map(s=>[s.stationId,s]));
    result.catalogOnly={added:[],removed:[],changed:[]};
    for(const station of after.catalogOnlyStations??[]){
      const prior=previous.get(station.stationId);previous.delete(station.stationId);
      if(!prior)result.catalogOnly.added.push(station.stationId);
      else if(sha(prior)!==sha(station))result.catalogOnly.changed.push(station.stationId);
    }
    result.catalogOnly.removed=[...previous.keys()];
  }
  return result;
}

export async function buildCoverage({ root = ROOT, dates, now = Date.now() }) {
  dates.forEach(validateDate);
  const dataDir = path.join(root, 'src/data');
  const stations = (await readLiteralArray(path.join(dataDir, 'stations.ts'), 'stations')).filter(s => prefixes.test(s.id));
  let bundled;
  try { bundled = await readLiteralArray(path.join(dataDir, 'bundled.ts'), 'bundledTables'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; bundled = await readLiteralArray(path.join(root, 'src/App.tsx'), 'bundledTables'); }
  const connected = new Map(bundled.map(t => [t.id, sha(t)]));
  const allStations = new Map(stations.map(s => [s.id, s]));
  const tables = [], sourceHashes = {}, retainedArtifacts = [];
  const filenames = (await readdir(dataDir)).filter(f => f.endsWith('.json')).sort();
  for (const filename of filenames) {
    const raw = await readFile(path.join(dataDir, filename), 'utf8'), rows = JSON.parse(raw);
    if (!Array.isArray(rows)) continue;
    const relevant = rows.filter(r => prefixes.test(r.stationId || r.id || ''));
    if (!relevant.length) continue;
    sourceHashes['src/data/' + filename] = sha(raw);
    // The user-owned draft remains on disk; the corrected network is the audit candidate.
    if (filenames.includes('kobe-expanded.json') && ['kobe-extra.json', 'kobe-extra-stations.json'].includes(filename)) {
      retainedArtifacts.push({ file: 'src/data/' + filename, records: relevant.length, reason: 'superseded draft retained; audited candidate is kobe-expanded' });
      continue;
    }
    if (filename === 'kobe-kaigan-candidate.json' && filenames.includes('kobe-kaigan.json')) {
      retainedArtifacts.push({file:'src/data/'+filename,records:relevant.length,reason:'unapproved candidate retained; reviewed active tables are kobe-kaigan.json'});
      continue;
    }
    for (const row of relevant) {
      if (row.departures) tables.push({ ...row, dataFile: 'src/data/' + filename });
      else if (row.directions && !allStations.has(row.id)) allStations.set(row.id, row);
    }
  }
  const duplicates = tables.filter((t, i) => tables.findIndex(o => o.id === t.id) !== i).map(t => t.id);
  const holidays = JSON.parse(await readFile(path.join(dataDir, 'holidays.json'), 'utf8'));
  const validations = new Map();
  for (const filename of (await readdir(path.join(root, 'docs'))).filter(f => /validation.*\.json$/.test(f))) {
    const doc = JSON.parse(await readFile(path.join(root, 'docs', filename), 'utf8'));
    const rows = Array.isArray(doc) ? doc : [...(doc.sources || []), ...(doc.tables || []).map(row => ({
      ...row, sourceUrl: row.sourceUrl || doc.sources?.find(s => s.key === row.sourceKey)?.sourceUrl,
    }))];
    for (const row of rows) if (row.id || row.tableId) {
      const id = row.id || row.tableId;
      if (!validations.has(id)) validations.set(id, []);
      validations.get(id).push({ file: 'docs/' + filename, record: row });
    }
  }
  const audited = tables.map(t => {
    const evidence = (validations.get(t.id) || []).filter(v => v.record.sourceUrl === t.sourceUrl && v.record.count === t.departures.length);
    const independentEvidence = evidence.some(v => v.record.sourceSampleVerification === 'passed' || v.record.sampleReview || v.record.crosscheck?.matched === t.departures.length || v.record.pcMobileAllTimesAndPlatformsMatched);
    return { id: t.id, stationId: t.stationId, operator: t.operator, line: t.line, directionId: t.directionId, direction: t.direction,
      dayType: t.dayType, serviceDates: t.serviceDates || null, sourceUrl: t.sourceUrl, retrievedAt: t.retrievedAt, checkedAt: t.checkedAt,
      revisionDate: t.revisionDate, validFrom: t.validFrom, validTo: t.validTo, verification: t.verification,
      sourceConditions: { ...sourcePolicies[t.stationId.split('-')[0]], notes: t.notes },
      connected: connected.get(t.id) === sha(Object.fromEntries(Object.entries(t).filter(([key]) => key !== 'dataFile'))), acquired: true, departureCount: t.departures.length,
      structureErrors: inspectTable(t), factsSha256: sha(t.departures), dataFile: t.dataFile,
      evidence: evidence.map(v => v.file), evidenceStatus: independentEvidence ? 'recorded-crosscheck' : 'additional-review-required',
      dates: dates.map(day => ({ day, status: assessDate(t, day, now, holidays) })) };
  });
  // A geographic station index has no reviewed train direction or operating day.
  // Keep it out of direction/day-cell counts instead of inventing one direction.
  const catalogOnlyStations = stations.filter(s => s.catalogOnly).map(s => ({stationId:s.id,station:s.name,line:s.line,operator:s.operator,
    physicalStationId:s.physicalStationId,searchable:true,timetableAcquired:false,timetableVerified:false,
    directionsVerified:false,currentDayValid:false,boardingJudgment:false,source:s.catalogSource}));
  const rows = [...allStations.values()].filter(station=>!station.catalogOnly).flatMap(station => station.directions.flatMap(direction => dates.map(day => {
    const available = audited.filter(t => t.stationId === station.id && t.directionId === direction.id);
    const applicable = available.filter(t => !['missing-date', 'wrong-day-type'].includes(t.dates.find(d => d.day === day).status));
    const ready = applicable.filter(t => t.connected && t.dates.find(d => d.day === day).status === 'ready');
    return { stationId: station.id, station: station.name, operator: station.operator, line: station.line, directionId: direction.id, direction: direction.name,
      day, dayType: calendarDay(day, holidays), searchable: stations.some(s => s.id === station.id), acquired: available.length > 0,
      tableIds: applicable.map(t => t.id), verifiedFlag: applicable.some(t => t.verification === 'verified'),
      independentlyRecorded: applicable.some(t => t.evidenceStatus === 'recorded-crosscheck'),
      validForDate: ready.length > 0, timetableAllowsEstimate: ready.length > 0,
      journeyDecision: ready.length ? 'requires-walking-platform-buffer-inputs' : 'unavailable',
      gaps: !available.length ? ['missing-table'] : !applicable.length ? ['missing-date-or-day-type'] : [...new Set(applicable.flatMap(t => [
        ...(!t.connected ? ['not-connected'] : []), ...t.structureErrors,
        ...(t.dates.find(d => d.day === day).status !== 'ready' ? [t.dates.find(d => d.day === day).status] : []),
        ...(t.evidenceStatus !== 'recorded-crosscheck' ? ['additional-review-required'] : []),
      ]))] };
  })));
  const feeds = JSON.parse(await readFile(path.join(root, 'server/western-feeds.json'), 'utf8'));
  let kyotoPending = null;
  try {
    const audit = JSON.parse(await readFile(path.join(root, 'docs/kyoto-expansion-20261026-audit.json'), 'utf8'));
    kyotoPending = { report: 'docs/kyoto-expansion-20261026-audit.json', checkedDate: audit.auditDate,
      stationLines: audit.stationLineCount, physicalStations: audit.physicalStationNameCount,
      acquiredSections: audit.inventory.length, connectedTables: audit.applicationTablesEmitted,
      limitation: 'All stop times are timepoint=0; official CSV not acquired for parity. Existing Imadegawa tables are separate.',
      source: audit.provenance, rows: audit.inventory };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const kaiganStations=stations.filter(s=>s.operator==='神戸市営地下鉄'&&s.line==='海岸線');
  const kaiganConnected=audited.filter(t=>t.connected&&t.operator==='神戸市営地下鉄'&&t.line==='海岸線');
  const kaiganExpected=kaiganStations.length?kaiganStations.reduce((count,s)=>count+s.directions.length*2,0):36;
  const kaiganCoverage={line:'海岸線',connectedTables:kaiganConnected.length,expectedTables:kaiganExpected,
    missingTables:kaiganExpected-kaiganConnected.length,
    status:kaiganConnected.length?'partial-current-source-coverage':'current-2026-source-acquisition-and-validation-pending',
    detail:kaiganConnected.length?'docs/kobe-kaigan-followup-20261026.md':'docs/kobe-expansion-20261026-validation.json'};
  return { schemaVersion: 1, auditedAt: new Date(now).toISOString(), dates, scope: 'repository local Kansai inventory; live API/phone storage not fetched',
    definitions: { verifiedFlag: 'Existing producer flag, not a new verification claim.', independentlyRecorded: 'Matching source/count and recorded sample or crosscheck; historic record, not a fresh source check.', timetableAllowsEstimate: 'Runtime timetable gate only; walking, platform and buffer inputs are still required.', physicalStationCounts: 'Same-operator same-name grouping; not a national interchange identifier.' },
    summary: { connectedStationLines: stations.length, connectedPhysicalStations: new Set(stations.map(s => s.operator + '/' + s.name)).size,
      acquiredStationLines: new Set(tables.map(t => t.stationId)).size, acquiredTables: tables.length, connectedTables: audited.filter(t => t.connected).length,
      structuralFailures: audited.filter(t => t.structureErrors.length).length, duplicateTableIds: duplicates,
      dateCells: rows.length, validDateCells: rows.filter(r => r.validForDate).length },
    sourceHashes, retainedArtifacts, catalogOnlyStations, rows, tables: audited,
    pendingNetworks: { kyoto: kyotoPending, kobeKaigan: kaiganCoverage },
    dynamicSearch: { checkedAt: feeds.checkedAt, searchIsNotCoverage: true, stationInventory: 'unknown; API search is capped, not a full line inventory',
      feeds: feeds.feeds.filter(f => /hankyu|hanshin|tokaido|sanyo/.test(f.feedId)).map(f => ({ ...f, acquired: 'not-probed-this-audit', verified: false, validForDate: 'unknown', timetableAllowsEstimate: false })) } };
}

export function coverageMarkdown(report) {
  const yes = v => v ? '○' : '—';
  return ['# 関西データの対応一覧', '', `監査時点: ${report.auditedAt}。ネットワーク取得なし。駅・路線単位 ${report.summary.connectedStationLines}、同一事業者・同名をまとめた駅数 ${report.summary.connectedPhysicalStations}、接続 ${report.summary.connectedTables} 表。`, '',
    '「検証印」は既存データのフラグ。「照合記録」は出典・件数に一致する過去の照合記録。今回の原典再検証を意味しない。「目安可」は時刻表条件のみで、徒歩・ホーム・余裕時間の入力が別途必要。', '',
    '|駅 / 路線|方面|運行日|検索|取得|検証印|照合記録|当日有効|目安可|不足・制約|', '|---|---|---|---|---|---|---|---|---|---|',
    ...report.rows.map(r => `|${r.station} / ${r.line}|${r.direction}|${r.day} (${r.dayType ?? '暦不明'})|${yes(r.searchable)}|${yes(r.acquired)}|${yes(r.verifiedFlag)}|${yes(r.independentlyRecorded)}|${yes(r.validForDate)}|${yes(r.timetableAllowsEstimate)}|${r.gaps.join(', ') || '徒歩等の条件入力が必要'}|`), '',
    'JSON版に各表の出典、取得日、検証日、改正日、適用期間、便数、ハッシュ、照合記録への参照を収録。未設定の期間終端は無期限の最新性保証ではない。', '',
    '## 公式の駅名検索用データ', '',
    `追加の${report.catalogOnlyStations?.length??0}駅・路線は駅名検索のみ。時刻表・実際の方面・運行日を取得しておらず、上の方面×運行日セルには含めない。国土数値情報の駅座標は入口ではない。`, '',
    '|駅 / 路線|検索|時刻表|方面|当日有効|出発目安|出典・基準日|', '|---|---|---|---|---|---|---|',
    ...(report.catalogOnlyStations??[]).map(s=>`|${s.station} / ${s.line}|○|未対応|未対応|判定不可|不可|[国土数値情報](${s.source.url})・${s.source.dataAsOf}・${s.source.license}を加工|`), '',
    '## 追加検索の範囲', '', '既存の非公式API検索は駅一覧の網羅を保証しない。今回の監査では通信せず、取得済み・当日有効とは数えない。全方面の参考表示であり乗車目安は判定しない。', '',
    '|フィード|路線|原資料取得日|運行期間（API登録値）|判定|', '|---|---|---|---|---|',
    ...report.dynamicSearch.feeds.map(f => `|${f.feedId}|${f.lines.join('・')}|${f.fetchedAt}|${f.serviceStart}〜${f.serviceEnd}|参考表示のみ|`), '',
    '## 未接続の一括資料', '',
    report.pendingNetworks.kobeKaigan.connectedTables
      ? `神戸・海岸線：現行2026年版のうち${report.pendingNetworks.kobeKaigan.connectedTables}表を接続。全${report.pendingNetworks.kobeKaigan.expectedTables}方面・平休区分のうち${report.pendingNetworks.kobeKaigan.missingTables}表は未接続。平日東行の保存済み公式原本を検査して接続し、新規HTTP取得成功とは区別する。詳細は [海岸線追調査](kobe-kaigan-followup-20261026.md)。`
      : '神戸・海岸線：現行2026年版の取得・検証が未完了。西神・山手線／北神線の追加数には含めない。', '',
    ...(report.pendingNetworks.kyoto ? [
      `京都GTFS：${report.pendingNetworks.kyoto.stationLines}駅・路線、${report.pendingNetworks.kyoto.physicalStations}同名をまとめた駅、${report.pendingNetworks.kyoto.acquiredSections}駅・方面・運行区分を取得済み。アプリ接続は${report.pendingNetworks.kyoto.connectedTables}表。全停車時刻が概算扱いのtimepoint=0で、公式CSVとの突合が未完了。既存の今出川公式表とは別集計。`, '',
      '[京都の原資料監査](kyoto-expansion-20261026-audit.json)', '',
      '|駅 / 路線|方面|元データ運行区分|取得|原資料の監査日で有効な区分|乗車判定|不足|', '|---|---|---|---|---|---|---|',
      ...report.pendingNetworks.kyoto.rows.map(r => `|${r.station} / ${r.line}|${r.direction}|${r.serviceId}|${yes(r.downloaded)}|${yes(r.feedCalendarActiveOnAuditDate)}|不可|概算時刻・公式CSV未照合|`), '',
    ] : ['京都GTFSの監査資料なし。取得済みと数えない。', '']),
    '[取得条件と拡張保留の詳細](western-expansion-20261026.md)', ''].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
  const now = value('--now') ? Date.parse(value('--now')) : Date.now();
  if (!Number.isFinite(now)) throw Error('Invalid audit clock');
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const dates = (value('--dates') || today).split(',');
  const report = await buildCoverage({ dates, now });
  const output = value('--out');
  if (!output) console.log(JSON.stringify(report, null, 2));
  else {
    // wx preserves every earlier audit; use a new timestamped basename to rerun.
    await writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    await writeFile(output + '.md', coverageMarkdown(report), { flag: 'wx' });
    console.log(JSON.stringify({ output, summary: report.summary }));
  }
  if (value('--compare')) console.log(JSON.stringify(diffCoverage(JSON.parse(await readFile(value('--compare'), 'utf8')), report), null, 2));
  if (report.summary.structuralFailures || report.summary.duplicateTableIds.length) process.exitCode = 1;
}

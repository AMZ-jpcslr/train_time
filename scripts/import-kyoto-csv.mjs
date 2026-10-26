/** Kyoto CSV acquisition preflight, NOT a completed timetable converter.
 * No application data is emitted until the actual eight files/schema can be reviewed.
 * One explicitly requested catalog request; no guessed URLs, retries or GTFS promotion.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tls from 'node:tls';
import { csvRecords, discoverCsvResources, CATALOG_URL } from './import-kyoto-network.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = raw => createHash('sha256').update(raw).digest('hex');
const INVENTORY_COLUMNS = ['データセット_タイトル', 'データセット_URL', 'ファイル_タイトル', 'ファイル_アクセスURL', 'ファイル_ダウンロードURL', 'ファイル_最終更新日'];

export function inspectInventory(text) {
  const rows = csvRecords(text);
  if (!rows.length || INVENTORY_COLUMNS.some(key => !(key in rows[0]))) throw new Error('Expected municipal open-data inventory columns');
  const matches = rows.filter(row => /京都市営地下鉄時刻表/.test(row['データセット_タイトル']));
  return {
    totalRows: rows.length,
    subwayResourceRows: matches.length,
    datasetTitles: [...new Set(matches.map(row => row['データセット_タイトル']))],
    resources: matches.map(row => ({
      dataset: row['データセット_タイトル'], title: row['ファイル_タイトル'],
      datasetUrl: row['データセット_URL'] || null,
      accessUrl: row['ファイル_アクセスURL'] || null,
      downloadUrl: row['ファイル_ダウンロードURL'] || null,
      modified: row['ファイル_最終更新日'] || null,
    })),
    currentTimetableAcquired: false,
  };
}

export function connectionStage(evidence) {
  if (evidence.tlsMs != null) return 'tls-complete-http-not-tested';
  if (evidence.tcpMs != null) return 'tls-handshake-incomplete';
  if (evidence.dns?.address) return 'tcp-connect-incomplete';
  return 'dns-incomplete';
}

export function diagnoseTls(timeoutMs = 8000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw new Error('Diagnostic timeout must be 100..15000 ms');
  return new Promise(resolve => {
    const started = Date.now();
    const evidence = { startedAt: new Date().toISOString(), host: 'data.city.kyoto.lg.jp', port: 443 };
    const socket = tls.connect({ host: evidence.host, port: 443, servername: evidence.host, rejectUnauthorized: true });
    const timer = setTimeout(() => { evidence.timeoutMs = Date.now() - started; socket.destroy(); }, timeoutMs);
    socket.on('lookup', (error, address) => { evidence.dns = { ms: Date.now() - started, address, error: error?.code ?? null }; });
    socket.on('connect', () => { evidence.tcpMs = Date.now() - started; });
    socket.on('secureConnect', () => { evidence.tlsMs = Date.now() - started; socket.destroy(); });
    socket.on('error', error => { evidence.error = { code: error.code, message: error.message }; });
    socket.on('close', () => { clearTimeout(timer); resolve({ ...evidence, stage: connectionStage(evidence) }); });
  });
}

/** Fails on redirects/challenges; records the response before schema/license review. */
export async function acquireCatalog(out, previousRaw = null, { fetcher = fetch } = {}) {
  const manifest = { source: CATALOG_URL, startedAt: new Date().toISOString(), maxRequests: 1, appTablesWritten: 0 };
  try {
    const response = await fetcher(CATALOG_URL, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    manifest.httpStatus = response.status;
    manifest.redirectLocation = response.headers.get('location');
    // Deliberate allowlist: never serialize cookies, authorization or all headers.
    manifest.responseHeaders = Object.fromEntries(['content-type', 'retry-after', 'x-amzn-waf-action', 'cf-mitigated']
      .map(name => [name, response.headers.get(name)?.slice(0, 512)])
      .filter(([, value]) => value != null));
    const chunks = []; let bytes = 0;
    if (response.body) for await (const chunk of response.body) {
      const remaining = 2_000_000 - bytes;
      chunks.push(chunk.subarray(0, Math.max(0, remaining)));
      bytes += chunk.byteLength;
      if (bytes > 2_000_000) break; // Cancels stream; no further transfer or retry.
    }
    const raw = Buffer.concat(chunks);
    await writeFile(path.join(out, 'catalog.html'), raw, { flag: 'wx' });
    Object.assign(manifest, { retrievedAt: new Date().toISOString(), bytes: raw.length,
      bodyBytes: bytes, bodyTruncated: bytes > 2_000_000, sha256: hash(raw) });
    if (manifest.bodyTruncated) throw new Error('Catalog exceeds 2 MB limit; saved body is a truncated prefix');
    const challenge = manifest.responseHeaders['x-amzn-waf-action'] || manifest.responseHeaders['cf-mitigated'];
    if (challenge) throw new Error(`Challenge response (${challenge}); do not bypass or retry automatically`);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}; inspect redirect/status before another request`);
    if (previousRaw) {
      const previous = await readFile(previousRaw);
      manifest.previous = { path: previousRaw, sha256: hash(previous), changed: hash(previous) !== hash(raw) };
    }
    manifest.csvLinks = discoverCsvResources(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    manifest.status = 'catalog-acquired-resource-and-schema-review-required';
  } catch (error) {
    manifest.status = 'blocked';
    manifest.error = { message: error.message, code: error.cause?.code ?? error.code ?? null };
  }
  manifest.completedAt = new Date().toISOString();
  await writeFile(path.join(out, 'catalog-attempt.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

async function main() {
  const [mode, source, previous] = process.argv.slice(2);
  if (!['--inventory', '--diagnose', '--catalog'].includes(mode)) throw new Error('Use --inventory FILE | --diagnose | --catalog [PREVIOUS_RAW]. No timetable conversion until source schema is reviewed.');
  const out = path.join(ROOT, '.cache/kyoto-csv', new Date().toISOString().replace(/[:.]/g, '-') + '-' + mode.slice(2));
  await mkdir(out, { recursive: true });
  let report;
  if (mode === '--inventory') {
    if (!source || previous) throw new Error('--inventory requires exactly one local file');
    const raw = await readFile(source);
    report = { source: path.resolve(source), sha256: hash(raw), bytes: raw.length, verifiedAt: new Date().toISOString(), ...inspectInventory(new TextDecoder('utf-8', { fatal: true }).decode(raw)) };
  } else if (mode === '--diagnose') {
    if (source) throw new Error('--diagnose takes no arguments');
    report = await diagnoseTls();
  } else {
    if (previous) throw new Error('--catalog accepts at most one previous raw file');
    report = await acquireCatalog(out, source);
  }
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: out, ...report }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

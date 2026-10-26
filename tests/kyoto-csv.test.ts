import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Standalone acquisition script is JavaScript.
import { acquireCatalog, inspectInventory, connectionStage } from '../scripts/import-kyoto-csv.mjs';

const temporaryDirectories: string[] = [];
async function acquireFixture(body: string, status = 200, headers: Record<string, string> = {}) {
  const out = await mkdtemp(path.join(tmpdir(), 'kyoto-csv-test-'));
  temporaryDirectories.push(out);
  const fetcher = vi.fn().mockResolvedValue(new Response(body, { status, headers }));
  const report = await acquireCatalog(out, null, { fetcher });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
  expect(report.appTablesWritten).toBe(0);
  expect(JSON.parse(await readFile(path.join(out, 'catalog-attempt.json'), 'utf8'))).toEqual(report);
  return { report, raw: await readFile(path.join(out, 'catalog.html')) };
}
afterEach(async () => {
  // Only the exact paths returned by mkdtemp above are removed.
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const header = 'データセット_タイトル,データセット_URL,ファイル_タイトル,ファイル_アクセスURL,ファイル_ダウンロードURL,ファイル_最終更新日';
describe('Kyoto official CSV acquisition boundaries', () => {
  it('retains missing inventory links without fabricating file endpoints', () => {
    const result = inspectInventory(header + '\n京都市営地下鉄時刻表（令和６年３月１６日）, ,烏丸線 平日 上り,,,2024-03-15'.replace(', ,', ',,'));
    expect(result.subwayResourceRows).toBe(1);
    expect(result.resources[0]).toMatchObject({ datasetUrl: null, accessUrl: null, downloadUrl: null, modified: '2024-03-15' });
    expect(result.currentTimetableAcquired).toBe(false);
  });
  it('keeps observed download links and distinguishes resources from title groups', () => {
    const result = inspectInventory(header + '\n京都市営地下鉄時刻表,https://example.invalid/catalog,平日,,https://example.invalid/a.csv,2026-03-13\n京都市営地下鉄時刻表,,休日,,,2026-03-13\n公衆トイレ,,,,,');
    expect(result.totalRows).toBe(3);
    expect(result.subwayResourceRows).toBe(2);
    expect(result.datasetTitles).toHaveLength(1);
    expect(result.resources[0].downloadUrl).toBe('https://example.invalid/a.csv');
    expect(result.currentTimetableAcquired).toBe(false);
  });
  it('rejects an unrecognized or ragged schema instead of claiming successful import', () => {
    expect(() => inspectInventory('station,time\nA,08:00')).toThrow('inventory columns');
    expect(() => inspectInventory(header + '\nonly-one-cell')).toThrow('column count');
  });
  it('separates DNS, TCP, TLS and untested HTTP stages', () => {
    expect(connectionStage({})).toBe('dns-incomplete');
    expect(connectionStage({ dns: { address: '192.0.2.1' } })).toBe('tcp-connect-incomplete');
    expect(connectionStage({ tcpMs: 0, timeoutMs: 8000 })).toBe('tls-handshake-incomplete');
    expect(connectionStage({ tcpMs: 100, tlsMs: 200 })).toBe('tls-complete-http-not-tested');
  });
  it('records an empty 202 WAF challenge without treating it as an acquired catalog', async () => {
    const { report, raw } = await acquireFixture('', 202, {
      'x-amzn-waf-action': 'challenge', 'retry-after': '60', 'set-cookie': 'private-cookie', authorization: 'private-token',
    });
    expect(report).toMatchObject({ status: 'blocked', httpStatus: 202, bodyBytes: 0, bodyTruncated: false,
      responseHeaders: { 'x-amzn-waf-action': 'challenge', 'retry-after': '60' } });
    expect(report.error.message).toContain('Challenge response');
    expect(JSON.stringify(report)).not.toContain('private-');
    expect(raw.length).toBe(0);
    expect(report.csvLinks).toBeUndefined();
  });
  it.each([
    '<html><body>メンテナンス中です</body></html>',
    '<html><body>00692 京都市営地下鉄時刻表 All rights reserved</body></html>',
  ])('rejects a 200 maintenance or license-mismatched body: %s', async body => {
    const { report, raw } = await acquireFixture(body);
    expect(report).toMatchObject({ status: 'blocked', httpStatus: 200, bodyBytes: Buffer.byteLength(body) });
    expect(report.error.message).toContain('Expected official Kyoto catalog');
    expect(raw.toString('utf8')).toBe(body);
    expect(report.csvLinks).toBeUndefined();
  });
  it('retains only observed CSV links from a valid small catalog and emits no app tables', async () => {
    const { report } = await acquireFixture('<html><body>00692 京都市営地下鉄時刻表 CC-BY 4.0 <a href="/resource/current.csv">平日</a><a href="/resource/info.pdf">説明</a><button>土休日ダウンロード</button></body></html>');
    expect(report.status).toBe('catalog-acquired-resource-and-schema-review-required');
    expect(report.csvLinks).toEqual([{ title: '平日', url: 'https://data.city.kyoto.lg.jp/resource/current.csv' }]);
  });
  it('preserves a non-200 redirect body and location without following it', async () => {
    const { report, raw } = await acquireFixture('Temporarily unavailable', 302, { location: '/maintenance', 'retry-after': '120' });
    expect(report).toMatchObject({ status: 'blocked', httpStatus: 302, redirectLocation: '/maintenance', bodyBytes: 23 });
    expect(raw.toString()).toBe('Temporarily unavailable');
    expect(report.error.message).toContain('HTTP 302');
  });
  it('bounds saved response bodies at 2 MB and rejects the truncated result', async () => {
    const { report, raw } = await acquireFixture('x'.repeat(2_000_001));
    expect(report).toMatchObject({ status: 'blocked', bytes: 2_000_000, bodyBytes: 2_000_001, bodyTruncated: true });
    expect(raw.length).toBe(2_000_000);
    expect(report.error.message).toContain('exceeds 2 MB');
  });
});

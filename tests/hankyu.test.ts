import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS source-discovery module; fixtures below are synthetic.
import { discoverHankyuLinks, inspectStation, sources, parseHankyuText, validateHankyuSnapshot, hankyuHtmlToText, validateHankyuSamples, validateHankyuCurrentReview, HANKYU_SAMPLE_REVIEW, HANKYU_PUBLIC_SOURCES } from '../scripts/import-hankyu.mjs';
import tables from '../src/data/hankyu.json';

describe('阪急/JRの取得保留と出典リンク検証（合成HTML）', () => {
  it('旧無日付リンクや別路線を採用せず、版番号を適用確認済み扱いしない', () => {
    const station = sources.find((s: { id: string }) => s.id === 'hankyu-umeda');
    const links = discoverHankyuLinks(`
      <a href="/station/html/HK-01_ko_2_w.html">旧平日</a>
      <a href="/station/html/20250222/HK-01_ko_2_w.html">改正後平日</a>
      <a href="/station/html/20250222/HK-01_ky_2_w.html">京都線</a>
      <a href="/station/html/20250222/HK-01_ta_2_w.html">宝塚線</a>
      <a href="/station/html/20250222/HK-16_ko_2_w.html">別駅</a>
      <a href="https://example.com/station/html/20250222/HK-01_ko_2_w.html">別事業者</a>
      <a href="/station/html/20250222/HK-01_ko_2_w.html">重複</a>
      <a href="/station/html/20250222/HK-01_ko_2_h.html">土曜休日</a>`, station);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ directionId: 'west', dayType: 'weekday', revisionCandidate: '2025-02-22', applicabilityVerified: false });
    expect(links[1].dayType).toBe('weekend');
  });
  it('神戸三宮の両方面は別IDで保持する', () => {
    const station = sources.find((s: { id: string }) => s.id === 'hankyu-sannomiya');
    const links = discoverHankyuLinks('<a href="/station/html/20250222/HK-16_ko_1_w.html">東</a><a href="/station/html/20250222/HK-16_ko_2_w.html">西</a>', station);
    expect(links.map((l: { directionId: string }) => l.directionId)).toEqual(['east', 'west']);
  });
  it('駅入口の読取成功を時刻表取込成功としない', () => {
    const station = sources.find((s: { id: string }) => s.id === 'jr-osaka');
    expect(inspectStation('<title>大阪駅</title><a href="https://timetable.jr-odekake.net/test">時刻表</a>', station)).toMatchObject({ importStatus: 'withheld', importedDepartures: 0 });
  });
  it('別駅の応答やエラーページを拒否する', () => {
    const station = sources.find((s: { id: string }) => s.id === 'jr-osaka');
    expect(() => inspectStation('<title>西宮駅</title>', station)).toThrow('駅名不一致');
    expect(() => inspectStation('<title>502 Bad Gateway</title>', station)).toThrow();
  });
});

const westText = `# 神戸三宮(阪急)駅 神戸線 新開地方面〈土曜・休日〉 時刻表
駅時刻表は行楽シーズンやお正月等の臨時ダイヤには対応しておりません。
  * 5時
 * 【85†00分 ［普通］山陽姫路ポップアップウィンドウで開く】
  * 12時
 * 【86†02分 ［特急］東二見ポップアップウィンドウで開く】
  * 0時
 * 【87†15分 ［普通］飾磨ポップアップウィンドウで開く】
時刻表について
本時刻表には加工・再利用の条件があります。`;
const sannomiya = sources.find((s: { id: string }) => s.id === 'hankyu-sannomiya');
function snapshot(text = westText) {
  const lines = text.split('\n').map((line, i) => [i + 100, line]);
  return { method: 'web-text-snapshot', sourceUrl: 'https://www.hankyu.co.jp/station/html/HK-16_ko_2_h.html', retrievedAt: '2026-10-22T04:00:00.000Z', totalLines: lines.length + 130, lines };
}

describe('阪急公開時刻表のテキスト解析', () => {
  it('山陽直通行先と種別を保持し、0時台を運行日の24時台にする', () => {
    const result = parseHankyuText(westText, sannomiya, 'west', 'weekend');
    expect(result).toEqual([
      { time: '05:00', destination: '山陽姫路', trainType: '普通', platform: null },
      { time: '12:02', destination: '東二見', trainType: '特急', platform: null },
      { time: '24:15', destination: '飾磨', trainType: '普通', platform: null },
    ]);
  });
  it.each([
    ['駅', westText.replace('神戸三宮(阪急)駅', '六甲駅')],
    ['方面', westText.replace('新開地方面', '大阪梅田方面')],
    ['曜日', westText.replace('土曜・休日', '平日')],
    ['未知種別', westText.replace('［普通］', '［未知］')],
    ['行先欠損', westText.replace('山陽姫路', '')],
    ['不正時刻', westText.replace('00分', '60分')],
    ['末尾欠落', westText.replace('本時刻表には加工・再利用の条件があります。', '')],
    ['未知注記', westText.replace('時刻表について', '不明な例外運転あり')],
  ])('%sが不正なら推測せず停止する', (_, text) => {
    expect(() => parseHankyuText(text, sannomiya, 'west', 'weekend')).toThrow();
  });
  it('重複便と時間逆順を拒否する', () => {
    expect(() => parseHankyuText(westText.replace('  * 12時', '* 00分 ［普通］山陽姫路ポップアップウィンドウで開く\n  * 12時'), sannomiya, 'west', 'weekend')).toThrow('Duplicate');
    expect(() => parseHankyuText(westText.replace('12時', '4時'), sannomiya, 'west', 'weekend')).toThrow('order');
  });
  it('時刻表本文が連続していれば無関係のナビゲーション欠落を要求しない', () => {
    const result = validateHankyuSnapshot(snapshot());
    expect(result.bodyLines).toEqual([100, 109]);
    expect(result.revisionCandidate).toBeNull();
    expect(result.directionId).toBe('west');
  });
  it('本文途中の取得gapと同一行番号重複を拒否する', () => {
    const gap = snapshot(); gap.lines.splice(4, 1);
    expect(() => validateHankyuSnapshot(gap)).toThrow('Incomplete');
    const duplicate = snapshot(); duplicate.lines[4][0] = duplicate.lines[3][0];
    expect(() => validateHankyuSnapshot(duplicate)).toThrow('duplicate');
  });
  it('他路線・他事業者の出典を拒否し日付パスを適用確定としない', () => {
    expect(() => validateHankyuSnapshot({ ...snapshot(), sourceUrl: snapshot().sourceUrl.replace('_ko_', '_ky_') })).toThrow('URL');
    expect(() => validateHankyuSnapshot({ ...snapshot(), sourceUrl: snapshot().sourceUrl.replace('www.hankyu.co.jp', 'example.com') })).toThrow('URL');
    expect(validateHankyuSnapshot({ ...snapshot(), sourceUrl: snapshot().sourceUrl.replace('/html/', '/html/20250222/') }).revisionCandidate).toBe('2025-02-22');
  });
  it('HTMLの文字情報を抽出しエラー画面は拒否する', () => {
    expect(hankyuHtmlToText('<body><h1>神戸線 時刻表</h1><p>5時</p><p>00分 ［普通］神戸三宮ポップアップウィンドウで開く</p><script>secret()</script></body>')).not.toContain('secret');
    expect(() => hankyuHtmlToText('<title>502</title>')).toThrow('structure');
  });
  it('独立照合した実資料10表1690便の始発・日中・終電・件数を一致させる', () => {
    expect(Object.keys(HANKYU_PUBLIC_SOURCES).sort()).toEqual(Object.keys(HANKYU_SAMPLE_REVIEW).sort());
    expect(tables).toHaveLength(10);
    expect(tables.reduce((n, t) => n + t.departures.length, 0)).toBe(1690);
    for (const [filename, expected] of Object.entries(HANKYU_SAMPLE_REVIEW)) {
      const code = filename.slice(0, 5);
      const station = sources.find((s: { code: string }) => s.code === code);
      const directionId = filename.includes('_ko_1_') ? 'east' : 'west', dayType = filename.endsWith('_w.json') ? 'weekday' : 'weekend';
      const table = tables.find(t => t.stationId === station.id && t.directionId === directionId && t.dayType === dayType);
      expect(table).toBeDefined();
      validateHankyuSamples(table!.departures, expected);
      expect(table!.verification).toBe('verified');
      expect([table!.validFrom, table!.validTo, table!.revisionDate]).toEqual(['2025-02-22', null, '2025-02-22']);
      expect(validateHankyuCurrentReview(table!.id, table!.sourceUrl, table!.departures).revisionDate).toBe('2025-02-22');
    }
  });
  it('現行版の再確認なしで変更時刻や他の出典を採用しない', () => {
    const table = tables[0];
    const changed = structuredClone(table.departures);
    changed[20].time = changed[20].time.replace(/.$/, changed[20].time.endsWith('9') ? '8' : '9');
    expect(() => validateHankyuCurrentReview(table.id, table.sourceUrl, changed)).toThrow('manual review');
    expect(() => validateHankyuCurrentReview(table.id, table.sourceUrl.replace('hankyu.co.jp', 'example.com'), table.departures)).toThrow('manual review');
    expect(() => validateHankyuCurrentReview(table.id, table.sourceUrl, table.departures, { revisionDate: '2026-01-01' })).toThrow('review missing');
  });
  it('英語種別と山陽直通先を既知辞書で変換し原語を保持する', () => {
    const text = `Kobe-sannomiya (Hankyu) Station Kobe Line Shinkaichi Direction 〈Weekdays〉timetable
22 time
28Minutes [Sanyo S Limited Express]Sanyo-Himejiポップアップウィンドウで開く
About the timetable
This timetable has reuse conditions`;
    const result = parseHankyuText(text, sannomiya, 'west', 'weekday');
    expect(result[0]).toMatchObject({ time: '22:28', trainType: '山陽S特急', destination: '山陽姫路', notes: ['原表の種別: Sanyo S Limited Express / 行先: Sanyo-Himeji'] });
    expect(() => parseHankyuText(text.replace('Sanyo-Himeji', 'Unknown-terminal'), sannomiya, 'west', 'weekday')).toThrow('Unknown translated');
    expect(() => parseHankyuText(text.replace('Sanyo S Limited Express', 'Unknown-type'), sannomiya, 'west', 'weekday')).toThrow('Unknown translated');
  });
  it('簡体中国語の普通区间を照合済み区間普通へ変換する', () => {
    const station = sources.find((s: { id: string }) => s.id === 'hankyu-umeda');
    const text = `大阪梅田(阪急)站神户线 神户三宫、新开地方向〈平日〉时刻表
0时间
10分钟 [普通区间]西宫北口ポップアップウィンドウで開く
关于时刻表
本时刻表有再利用条件`;
    expect(parseHankyuText(text, station, 'west', 'weekday')[0]).toMatchObject({ time: '24:10', destination: '西宮北口', trainType: '区間普通', notes: ['原表の種別: 普通区间 / 行先: 西宫北口'] });
  });
  it('本文見出し欠落時は同URLのタイトルと別資料の平日見出しをともに必要とする', () => {
    const sourceUrl = 'https://www.hankyu.co.jp/en/station/html/HK-16_ko_1_w.html';
    const documentTitle = `Kobe-sannomiya (Hankyu) Station Kobe Line Osaka-umeda timetable | Route maps (${sourceUrl})`;
    const text = '5 time\n02Minutes [Local]Osaka-umedaポップアップウィンドウで開く\nAbout the timetable\nThis timetable has reuse conditions';
    const identityEvidence = { sourceUrl: 'https://www.hankyu.co.jp/ch/station/html/HK-16_ko_1_w.html', retrievedAt: '2026-10-22T04:00:00Z', heading: '# 神户三宫（阪急） 车站神户线大阪梅田方向〈平日〉时刻表' };
    expect(() => parseHankyuText(text, sannomiya, 'east', 'weekday', { documentTitle, sourceUrl })).toThrow('identity evidence');
    expect(parseHankyuText(text, sannomiya, 'east', 'weekday', { documentTitle, sourceUrl, identityEvidence })[0].time).toBe('05:02');
    expect(() => parseHankyuText(text, sannomiya, 'east', 'weekday', { documentTitle, sourceUrl, identityEvidence: { ...identityEvidence, heading: identityEvidence.heading.replace('平日', '休日') } })).toThrow('mismatch');
    expect(() => parseHankyuText(text, sannomiya, 'east', 'weekday', { documentTitle: documentTitle.replace('Osaka-umeda', 'Shinkaichi'), sourceUrl, identityEvidence })).toThrow('title');
  });
  it('サンプルが変われば自動採用を止める', () => {
    expect(() => validateHankyuSamples(parseHankyuText(westText, sannomiya, 'west', 'weekend'), HANKYU_SAMPLE_REVIEW['HK-16_ko_2_h.json'])).toThrow('manual review');
  });
});

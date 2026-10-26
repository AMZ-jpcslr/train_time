import { bundledTables } from './data/bundled';
import { availability, selectTable, tokyoDate } from './domain/time';
import type { Station, Timetable } from './domain/types';
import './kansai-coverage.css';

const localKansai = /^(kobe-|kyoto-|jr-|hankyu-|hanshin-)/;
const days: Record<string, string> = { weekday: '平日', saturday: '土曜', holiday: '休日', weekend: '土休日' };
const statusLabels = { ready: '目安を計算できる時刻表あり', missing: 'この日の時刻表なし', expired: '確認期限・適用期間外', unverified: '参考表示のみ', special: '特別ダイヤ未確認', 'calendar-unknown': 'この年の祝日未確認' };
const checkedDate = (value: string) => Number.isFinite(Date.parse(value)) ? tokyoDate(Date.parse(value)) : '未確認';

export function kansaiDirectionStatus(catalog: Timetable[], live: Timetable[], stationId: string, directionId: string, day: string, now: number) {
  const stored = catalog.filter(t => t.stationId === stationId && t.directionId === directionId);
  const runtime = selectTable(live, stationId, directionId, day);
  const saved = selectTable(stored, stationId, directionId, day);
  const selected = runtime ?? saved;
  let status = availability(selected, day, now);
  if (selected && stationId.startsWith('jr-') && status === 'ready') {
    const age = now - Date.parse(selected.retrievedAt);
    if (!Number.isFinite(age) || age < 0 || age >= 6 * 3600000) status = 'expired';
  }
  // A retained bundle must not make a rejected/unavailable live result look usable.
  if (status === 'ready' && !runtime) status = 'missing';
  const acquired = runtime ? [...stored, runtime] : stored;
  const patterns = [...new Set(acquired.filter(t => !t.serviceDates).map(t => days[t.dayType]))];
  const dated = [...new Set(acquired.flatMap(t => t.serviceDates ?? []))].sort();
  return { stored, selected, status, ready: Boolean(runtime) && status === 'ready',
    acquired: stored.length > 0 || Boolean(runtime), verified: stored.some(t => t.verification === 'verified') || runtime?.verification === 'verified',
    range: [...patterns, ...(dated.length ? [`${dated[0]}〜${dated.at(-1)}（${dated.length}日）`] : [])].join('・') || '未取得',
    label: !stored.length && !runtime ? '時刻表が未対応' : statusLabels[status] };
}

export default function KansaiCoverage({ stations, tables, day, now }: { stations: Station[]; tables: Timetable[]; day: string; now: number }) {
  const local = stations.filter(s => localKansai.test(s.id));
  const operators = [...new Set(local.map(s => s.operator))];
  const physical = new Set(local.map(s => s.operator + '/' + s.name)).size;
  const catalog = local.filter(s=>s.catalogOnly);
  const kaiganTables=bundledTables.filter(t=>t.operator==='神戸市営地下鉄'&&t.line==='海岸線');
  return <section className="kansai-coverage" aria-labelledby="kansai-coverage-title">
    <h3 id="kansai-coverage-title">関西の対応状況</h3>
    <p>{local.length}駅・路線（同じ事業者の同名駅をまとめると{physical}駅）。検索できても、方面や日付によって時刻表がない場合があります。</p>
    {catalog.length>0&&<p className="kansai-coverage-note">うちJRの追加{catalog.length}駅・路線（同名をまとめると{new Set(catalog.map(s=>s.physicalStationId)).size}駅）は駅名検索のみです。時刻表・方面・出発目安は未対応です。駅情報は<a href={catalog[0].catalogSource!.url} target="_blank" rel="noreferrer">国土数値情報（2025年度）</a>を加工（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noreferrer">CC BY 4.0</a>）。基準日は2025-12-31で、当日の運行情報ではありません。</p>}
    <p className="kansai-coverage-note">運行日：{day}。「当日」はこの運行日を指します。目安の計算には徒歩・ホームまでの時間・余裕時間も必要です。遅延・運休は反映しません。</p>
    {operators.map(operator => {
      const grouped = local.filter(s => s.operator === operator);
      const rows = grouped.flatMap(station => station.directions.map(direction => ({ station, direction,
        coverage: kansaiDirectionStatus(bundledTables, tables, station.id, direction.id, day, now) })));
      return <details key={operator}>
        <summary>{operator} <span>{grouped.length}駅・路線 / 当日利用 {rows.filter(r => r.coverage.ready).length}方面</span></summary>
        <p className="kansai-coverage-note">「照合済」は保存版の確認状態です。当日利用できるかは別に確認します。検索対象はこの一覧にある駅・路線です。</p>
        <div className="kansai-coverage-scroll" tabIndex={0} role="region" aria-label={`${operator}の駅・方面別対応一覧。横にスクロールできます`}>
          <table><caption>{operator}：{day}の保存・利用状況</caption><thead><tr><th scope="col">駅・路線 / 方面</th><th scope="col">取得した運行日</th><th scope="col">取得 / 照合</th><th scope="col">当日の利用</th></tr></thead><tbody>
            {rows.map(({ station, direction, coverage }) => <tr key={station.id + direction.id}>
              <th scope="row">{station.name}<small>{station.line}<br />{direction.name}</small></th>
              <td>{station.catalogOnly?'時刻表は未対応':coverage.range}</td><td>{coverage.acquired ? '取得済' : '未取得'}<br />{coverage.verified ? '保存版は照合済' : '未照合'}</td>
              <td><span className={coverage.ready ? 'kansai-coverage-ready' : ''}>{station.catalogOnly?'駅名検索のみ・計算できません':coverage.label}</span>
                {coverage.selected && <small>確認日 {checkedDate(coverage.selected.checkedAt)}<br /><a href={coverage.selected.sourceUrl} target="_blank" rel="noreferrer">出典を見る ↗</a></small>}
              </td>
            </tr>)}
          </tbody></table>
        </div>
      </details>;
    })}
    <details><summary>これから対応する路線・資料</summary>
      <dl>
        <dt>神戸・海岸線</dt><dd>{kaiganTables.length?<>平日・三宮・花時計前方面の{kaiganTables.length}表を接続しました。新長田〜旧居留地・大丸前の9駅・方面です。新長田方面と土休日の27表は未取得のため、その条件では計算できません。保存済み公式ファイルを検査しており、元のダウンロード日時は記録がありません。取込日・照合日とは分けて表示しています。</>:<>現行版の一括時刻表を取得・照合できていません。海岸線の乗車目安には未対応です。</>}</dd>
        <dt>京都・烏丸線／東西線の全線</dt><dd>一括資料は32駅・路線（同名駅をまとめると31駅）、方面・平休日を合わせた128区分を取得済みです。ただし全時刻が概算扱いで、公式CSVとの照合も未完了のため接続していません。今出川の既存の公式時刻表は別に確認しています。<a href="https://data.city.kyoto.lg.jp/dataset/00692/?page=1" target="_blank" rel="noreferrer">京都の公開資料 ↗</a></dd>
        <dt>JR神戸線・京都線・琵琶湖線の追加駅</dt><dd>公式の駅データを使い、駅名検索とお気に入りを追加しました。新駅の時刻表を無料で再利用できる公式資料は確認できていないため、出発目安には未対応です。既存4駅の時刻表対応は別です。</dd>
        <dt>阪急神戸線、阪神本線の追加駅</dt><dd>一括取得・再利用の条件を確認中です。非公式の追加検索で見つかる参考時刻は、この一覧の当日利用数には含めていません。</dd>
      </dl>
      <p className="kansai-coverage-note">未対応・未取得・期限切れは終電後という意味ではありません。必要な時刻は各社の公式時刻表で確認してください。</p>
    </details>
  </section>;
}

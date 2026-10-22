import { useEffect, useState } from 'react';
import type { Timetable } from './domain/types';

export const JR_DAILY_TTL_MS = 6 * 3600000;
const RETRY_MS = 15 * 60000;
const STORAGE_KEY = 'mania-u:jr-daily:v2';
const DIRECTIONS = new Set([
  'jr-nishinomiya-east', 'jr-nishinomiya-west', 'jr-osaka-east', 'jr-osaka-west',
  'jr-ibaraki-east', 'jr-ibaraki-west', 'jr-minamikusatsu-east', 'jr-minamikusatsu-west',
]);
export type DailyResult = {
  schemaVersion: 2; serviceDate: string; tables: Timetable[]; status: 'ready'; expiresAt: string; errors: string[];
};
export type DailyStatus = {
  day: string; phase: 'idle' | 'loading' | 'ready' | 'offline' | 'unavailable';
  message: string; nextAttemptAt: number; rejectCache: boolean;
};
const initialStatus: DailyStatus = { day: '', phase: 'idle', message: '', nextAttemptAt: 0, rejectCache: false };
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(date + 'T00:00:00Z'))
  && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === 'string');

/** API responses and localStorage are data, not trusted application state. */
export function validDailyResult(value: unknown, date: string): value is DailyResult {
  if (!isDate(date) || !value || typeof value !== 'object') return false;
  const result = value as DailyResult;
  if (result.schemaVersion !== 2 || result.serviceDate !== date || result.status !== 'ready' || !Array.isArray(result.tables) || result.tables.length !== 8 || !strings(result.errors)) return false;
  const remaining = new Set(DIRECTIONS);
  for (const table of result.tables) {
    if (!table || typeof table !== 'object' || (table as Timetable & { scopeVersion?: number }).scopeVersion !== 2) return false;
    const key = `${table.stationId}-${table.directionId}`;
    if (!remaining.delete(key) || table.id !== `${key}-${date}` || table.validFrom !== date || table.validTo !== date
      || table.serviceDates?.length !== 1 || table.serviceDates[0] !== date || table.verification !== 'verified'
      || !Number.isFinite(Date.parse(table.retrievedAt)) || table.checkedAt !== table.retrievedAt
      || !['weekday', 'saturday', 'holiday'].includes(table.dayType) || !strings(table.notes)
      || ![table.operator, table.line, table.direction].every(x => typeof x === 'string' && x.length > 0)) return false;
    try {
      const url = new URL(table.sourceUrl);
      if (url.origin !== 'https://timetable.jr-odekake.net' || !/^\/station-timetable\/\d+$/.test(url.pathname)
        || url.search !== `?date=${date.replaceAll('-', '')}`) return false;
    } catch { return false; }
    if (!Array.isArray(table.departures) || table.departures.length === 0 || table.departures.length > 1000) return false;
    for (let i = 0; i < table.departures.length; i++) {
      const departure = table.departures[i];
      if (!departure || !/^(?:0[4-9]|1\d|2[0-7]):[0-5]\d$/.test(departure.time)
        || typeof departure.destination !== 'string' || !departure.destination
        || !(departure.trainType === null || typeof departure.trainType === 'string')
        || !(departure.platform === null || typeof departure.platform === 'string')
        || (departure.notes !== undefined && !strings(departure.notes))
        || (i > 0 && table.departures[i - 1].time > departure.time)) return false;
    }
  }
  const retrieved = Math.min(...result.tables.map(t => Date.parse(t.retrievedAt)));
  const expiry = Date.parse(result.expiresAt);
  // Never let a stored/returned expiry extend the six-hour policy.
  return typeof result.expiresAt === 'string' && Number.isFinite(expiry)
    && expiry > retrieved && expiry <= retrieved + JR_DAILY_TTL_MS;
}

export function readSavedDaily(raw: string | null): Record<string, DailyResult> {
  try {
    const saved: unknown = JSON.parse(raw || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([date, value]) => validDailyResult(value, date))) as Record<string, DailyResult>;
  } catch { return {}; }
}
function savedDaily() {
  try { return readSavedDaily(localStorage.getItem(STORAGE_KEY)); } catch { return {}; }
}

function fresh(result: DailyResult, now: number) {
  return Date.parse(result.expiresAt) > now && result.tables.every(t => Date.parse(t.retrievedAt) <= now);
}

/** The selected operating day is independent of the actual freshness clock. */
export function selectDailyResult(
  bundled: Timetable[], daily: Record<string, DailyResult>, day: string, now: number, rejectCache = false,
): { result: DailyResult; source: 'saved' | 'bundled' } | null {
  if (rejectCache) return null;
  const tables = bundled.filter(t => t.stationId.startsWith('jr-') && t.serviceDates?.length === 1 && t.serviceDates[0] === day);
  const oldest = Math.min(...tables.map(t => Date.parse(t.retrievedAt)));
  const fallback = Number.isFinite(oldest) ? {
    schemaVersion: 2, serviceDate: day, tables, status: 'ready', expiresAt: new Date(oldest + JR_DAILY_TTL_MS).toISOString(), errors: [],
  } : null;
  const candidates: { result: DailyResult; source: 'saved' | 'bundled' }[] = [];
  if (validDailyResult(daily[day], day) && fresh(daily[day], now)) candidates.push({ result: daily[day], source: 'saved' });
  if (validDailyResult(fallback, day) && fresh(fallback, now)) candidates.push({ result: fallback, source: 'bundled' });
  // A newer checked bundle can supersede an older saved response, and vice versa.
  return candidates.sort((a, b) => Date.parse(b.result.expiresAt) - Date.parse(a.result.expiresAt))[0] ?? null;
}

export function dailyRefreshDue(status: DailyStatus, day: string, now: number): boolean {
  return status.day === day && status.phase !== 'idle' && status.phase !== 'loading' && now >= status.nextAttemptAt;
}
function retryAt(value: unknown, now: number) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) && stamp > now ? Math.min(stamp, now + RETRY_MS) : now + RETRY_MS;
}
function sourceError(value: unknown) {
  const errors = value && typeof value === 'object' && 'errors' in value ? value.errors : undefined;
  return strings(errors) && errors.length ? errors.join(' / ') : 'この日付の時刻表を取得・検証できませんでした。';
}

export function useTimetables(bundled: Timetable[], stationId: string, day: string, now: number) {
  const [daily, setDaily] = useState(savedDaily);
  const [status, setStatus] = useState<DailyStatus>(initialStatus);
  const [refresh, setRefresh] = useState(0);
  const isJr = stationId.startsWith('jr-');
  useEffect(() => {
    if (!isJr) return;
    let active = true;
    const controller = new AbortController();
    setStatus(previous => ({ day, phase: 'loading', message: '', nextAttemptAt: Infinity, rejectCache: previous.day === day && previous.rejectCache }));
    fetch('/api/jr?date=' + encodeURIComponent(day), { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw Error('日付別時刻表サーバーに接続できませんでした。');
        return response.json() as Promise<unknown>;
      }).then(result => {
        if (!active) return;
        const checkedNow = Date.now();
        if (!validDailyResult(result, day) || !fresh(result, checkedNow)) {
          const next = result && typeof result === 'object' && 'retryAfter' in result ? result.retryAfter : undefined;
          // An explicit server rejection must not reveal the bundled copy again.
          setStatus({ day, phase: 'unavailable', message: sourceError(result), nextAttemptAt: retryAt(next, checkedNow), rejectCache: true });
          return;
        }
        setDaily(old => {
          const next = { ...old, [day]: result };
          const other = Object.keys(next).filter(key => key !== day).sort((a, b) => Date.parse(next[b].expiresAt) - Date.parse(next[a].expiresAt)).slice(0, 4);
          const bounded = Object.fromEntries([...other, day].map(key => [key, next[key]]));
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded)); } catch { /* Memory remains usable if storage is full or denied. */ }
          return bounded;
        });
        setStatus({ day, phase: 'ready', message: 'JRの日付別公式時刻表を確認済み（取得から6時間以内）', nextAttemptAt: Date.parse(result.expiresAt), rejectCache: false });
      }).catch(error => {
        if (!active) return;
        setStatus(previous => ({ day, phase: 'offline', message: error instanceof Error ? error.message : '時刻表の更新に失敗しました。', nextAttemptAt: Date.now() + RETRY_MS, rejectCache: previous.day === day && previous.rejectCache }));
      });
    return () => { active = false; controller.abort(); };
  }, [day, isJr, refresh]);

  // `now` is the real clock passed by App, including pageshow/visibility updates.
  // A fixed six-hour epoch would miss the actual source-acquisition expiry.
  useEffect(() => {
    if (isJr && dailyRefreshDue(status, day, now)) {
      setStatus(previous => ({ ...previous, phase: 'loading', nextAttemptAt: Infinity }));
      setRefresh(value => value + 1);
    }
  }, [isJr, day, now, status]);

  const current = status.day === day ? status : initialStatus;
  const chosen = selectDailyResult(bundled, daily, day, now, current.rejectCache);
  // Only the exact selected operating day is exposed for JR. Other operators are untouched.
  const tables = [...bundled.filter(t => !t.stationId.startsWith('jr-')), ...(chosen?.result.tables ?? [])];
  let message = current.message;
  if (current.phase === 'loading' || current.phase === 'idle') message = chosen
    ? 'JR時刻表を確認しています。同日の保存データ（取得から6時間以内）を表示しています。'
    : 'この運行日のJR時刻表を確認しています。再取得するまで徒歩判定はできません。';
  else if (current.phase === 'offline') message += chosen
    ? ' 同日の保存データを表示中です。取得から6時間を超えると使用を停止します。'
    : ' 利用可能な同日の保存データがありません（未取得または6時間期限切れ）。';
  else if (current.phase === 'unavailable') message += ' この日の時刻表による徒歩判定は停止しています。';
  else if (!chosen) message = '保存したJR時刻表の6時間期限を過ぎています。再取得するまで徒歩判定はできません。';
  return { tables, message: isJr ? message : '', loading: isJr && (current.phase === 'loading' || current.phase === 'idle'), refresh: () => setRefresh(value => value + 1) };
}

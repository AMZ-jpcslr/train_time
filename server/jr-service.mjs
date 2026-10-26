/** Local-only daily JR acquisition. Never generalize a weekday into another date. */
import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectJr, JR_SCOPE_VERSION, validDate, currentJrServiceDate } from '../scripts/import-jr.mjs';
import {JR_SCOPE,expectedJrDirectionKeys,matchesJrDirection} from '../src/domain/jr-scope.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const errorText = error => error instanceof Error ? error.message : 'JR source acquisition failed';

async function atomicJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, target);
}

export function validateResult(day, value) {
  if (!value || !Array.isArray(value.tables) || !Array.isArray(value.evidence)) throw Error('JR daily result missing');
  const expected = new Set([...expectedJrDirectionKeys()].map(key=>`${key}-${day}`));
  if (value.tables.length !== expected.size || value.evidence.length !== expected.size) throw Error('JR daily direction coverage mismatch');
  for (const table of value.tables) {
    if (!expected.delete(table.id) || !matchesJrDirection(table) || table.id!==`${table.stationId}-${table.directionId}-${day}` || table.scopeVersion !== JR_SCOPE_VERSION || table.verification !== 'verified' || table.validFrom !== day || table.validTo !== day || JSON.stringify(table.serviceDates) !== JSON.stringify([day])) throw Error('JR daily date/verification/scope mismatch');
    const url = new URL(table.sourceUrl);
    if (url.origin !== JR_SCOPE.sourceOrigin || !/^\/station-timetable\/\d+$/.test(url.pathname) || url.search !== `?date=${day.replaceAll('-', '')}`) throw Error('JR daily source mismatch');
    if (!Number.isFinite(Date.parse(table.retrievedAt)) || table.checkedAt !== table.retrievedAt || !table.departures?.length) throw Error('JR daily provenance missing');
    const keys = new Set();
    for (let i = 0; i < table.departures.length; i++) {
      const d = table.departures[i], key = JSON.stringify([d.time,d.destination,d.trainType,d.platform]);
      if (!/^(?:0[4-9]|1\d|2[0-7]):[0-5]\d$/.test(d.time) || typeof d.destination !== 'string' || !d.destination || typeof d.trainType !== 'string' || !d.trainType || !(d.platform === null || typeof d.platform === 'string') || keys.has(key) || (i && table.departures[i-1].time > d.time)) throw Error('JR daily departure validation mismatch');
      keys.add(key);
    }
    const evidence = value.evidence.find(item => item.id === table.id);
    if (!evidence || evidence.sourceUrl !== table.sourceUrl || evidence.retrievedAt !== table.retrievedAt || evidence.count !== table.departures.length || evidence.scope?.version !== JR_SCOPE_VERSION || !Array.isArray(evidence.scope.excluded) || evidence.scope.sourceCount !== evidence.count + evidence.scope.excluded.length || !evidence.displayedDateMatched || !evidence.pcMobileAllTimesAndPlatformsMatched || evidence.duplicates !== 0 || !evidence.sorted) throw Error('JR daily verification evidence mismatch');
  }
  return value;
}

/**
 * clock/loader are injectable for offline tests. In production the collector uses
 * same-origin official HTML, 1.2 seconds between requests and 20-second timeouts.
 * Return unavailable on expired data: even a same-day stale result is not hidden.
 */
export function createJrService({
  root = ROOT,
  clock = Date.now,
  ttlMs = 6 * HOUR,
  backoffMs = 15 * 60 * 1000,
  loader = (day, refresh) => collectJr({ day, refresh, root }),
} = {}) {
  const folder = path.join(root, '.cache/jr-service');
  const inflight = new Map();
  let queue = Promise.resolve();

  function isFresh(result) {
    const stamp = Math.min(...result.tables.map(t => Date.parse(t.retrievedAt)));
    return stamp <= clock() && clock() - stamp < ttlMs;
  }
  function ready(day, result, source) {
    const stamp = Math.min(...result.tables.map(t => Date.parse(t.retrievedAt)));
    return { schemaVersion: JR_SCOPE_VERSION, serviceDate: day, tables: result.tables, status: 'ready', source, fetchedAt: new Date(stamp).toISOString(), expiresAt: new Date(stamp + ttlMs).toISOString(), retryAfter: null, errors: [] };
  }
  function unavailable(day, error, nextAttemptAt) {
    return { schemaVersion: JR_SCOPE_VERSION, serviceDate: day, tables: [], status: 'unavailable', source: 'none', fetchedAt: null, expiresAt: null, retryAfter: new Date(nextAttemptAt).toISOString(), errors: [error] };
  }
  async function readDaily(day) {
    try {
      const envelope = JSON.parse(await readFile(path.join(folder, `${day}.json`), 'utf8'));
      if (envelope.version !== JR_SCOPE_VERSION || envelope.serviceDate !== day || envelope.sha256 !== hash(envelope.result)) throw Error('JR normalized cache integrity/scope-version mismatch');
      return validateResult(day, envelope.result);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      // Modified local cache cannot be served; source validation must run again.
      return null;
    }
  }
  async function persist(day, result) {
    const target = path.join(folder, `${day}.json`);
    await mkdir(folder, { recursive: true });
    try { await copyFile(target, `${target}.${clock()}.previous`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomicJson(target, { version: JR_SCOPE_VERSION, serviceDate: day, sha256: hash(result), result });
  }
  async function acquire(day) {
    const failurePath = path.join(folder, `${day}.failure.json`);
    let cached = await readDaily(day);
    if (cached && isFresh(cached)) return ready(day, cached, 'cache');
    // Reuse original HTML and its real timestamps after CLI imports or restart.
    if (!cached) {
      try {
        cached = validateResult(day, await loader(day, false));
        if (isFresh(cached)) { await persist(day, cached); return ready(day, cached, 'cache'); }
      } catch { /* A missing or invalid source cache requires an ordinary GET. */ }
    }
    try {
      const failure = JSON.parse(await readFile(failurePath, 'utf8'));
      if (failure.serviceDate === day && failure.nextAttemptAt > clock()) return unavailable(day, failure.error, failure.nextAttemptAt);
    } catch { /* No previous failure. */ }
    try {
      const result = validateResult(day, await loader(day, true));
      if (!isFresh(result)) throw Error('JR source acquisition timestamp outside freshness window');
      await persist(day, result);
      await atomicJson(failurePath, { serviceDate: day, nextAttemptAt: 0, error: null });
      return ready(day, result, 'network');
    } catch (error) {
      const message = errorText(error), nextAttemptAt = clock() + backoffMs;
      await atomicJson(failurePath, { serviceDate: day, nextAttemptAt, error: message });
      return unavailable(day, message, nextAttemptAt);
    }
  }
  function getJrTimetables(day) {
    validDate(day);
    const delta = (Date.parse(day) - Date.parse(currentJrServiceDate(clock()))) / DAY;
    // The UI requests today; a bounded date picker may also request nearby days.
    if (delta < -1 || delta > 31) throw Error('JR operating date must be yesterday through 31 days ahead');
    if (inflight.has(day)) return inflight.get(day);
    // Serialize different operating days as well as collapsing concurrent same-day calls.
    const task = queue.then(() => acquire(day));
    queue = task.then(() => undefined, () => undefined);
    inflight.set(day, task);
    task.finally(() => inflight.delete(day)).catch(() => {});
    return task;
  }
  return { getJrTimetables };
}

const defaultService = createJrService();
export const getJrTimetables = day => defaultService.getJrTimetables(day);

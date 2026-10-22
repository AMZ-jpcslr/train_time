import type {Position} from './types';
import {positionStatus, validPosition} from './journey';

export const LOCATION_WAIT_MS = 20_000;
export interface LocationResult {position: Position|null; errorCode?: number}
type GeolocationSource = Pick<Geolocation, 'watchPosition'|'clearWatch'>;

/** A user-triggered, bounded watch. Samples stay in memory; only the final fix is routed. */
export function collectPosition(
  source: GeolocationSource,
  onProgress: (position: Position) => void,
  onFinish: (result: LocationResult) => void,
  clock: () => number = Date.now,
): () => void {
  let best: Position|null = null;
  let settled = false;
  let watchId: number|undefined;
  let lastError: number|undefined;
  const stop = () => {
    settled = true;
    clearTimeout(timer);
    if (watchId !== undefined) source.clearWatch(watchId);
  };
  const finish = (result: LocationResult) => {
    if (settled) return;
    stop();
    onFinish(result);
  };
  const timer = setTimeout(() => finish({position: best, errorCode: best ? undefined : lastError ?? 3}), LOCATION_WAIT_MS);
  try {
    watchId = source.watchPosition(raw => {
      if (settled) return;
      const candidate = {lat: raw.coords.latitude, lon: raw.coords.longitude, accuracy: raw.coords.accuracy, timestamp: raw.timestamp};
      const now = clock();
      if (!validPosition(candidate, now)) return;
      const isStale = positionStatus(candidate, now) === 'stale';
      const bestIsStale = best ? positionStatus(best, now) === 'stale' : true;
      if (!best || (bestIsStale && !isStale) || (bestIsStale === isStale &&
        (candidate.accuracy < best.accuracy || (candidate.accuracy === best.accuracy && candidate.timestamp > best.timestamp)))) {
        best = candidate;
        onProgress(candidate);
      }
      if (best && positionStatus(best, now) === 'fresh') finish({position: best});
    }, error => {
      if (settled) return;
      lastError = error.code;
      // A temporary unavailable/timeout can be followed by a better fix on the same watch.
      if (error.code === 1) finish({position: null, errorCode: 1});
    }, {enableHighAccuracy: true, maximumAge: 0, timeout: LOCATION_WAIT_MS});
    // Also supports browser adapters that invoke their callback synchronously.
    if (settled) source.clearWatch(watchId);
  } catch {
    finish({position: null, errorCode: 2});
  }
  return stop;
}

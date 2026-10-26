import {useEffect, useRef, useState} from 'react';
import {collectPosition} from './domain/geolocation';
import {geolocationError, positionStatus} from './domain/journey';
import type {Position} from './domain/types';

export function useGeolocation() {
  const [position, setPosition] = useState<Position|null>(null);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('現在地はまだ取得していません');
  const stop = useRef<(() => void)|null>(null);
  const generation = useRef(0);
  const cancel = (text = '位置情報の取得を中止しました。') => {
    generation.current++;
    stop.current?.();
    stop.current = null;
    setLocating(false);
    setPosition(null);
    setMessage(text);
  };
  useEffect(() => {
    const hide = () => {
      if (document.hidden && stop.current) cancel('画面を離れたため位置情報の取得を中止しました。もう一度「現在地を更新」を押してください。');
    };
    const pagehide = () => {if (stop.current) cancel('画面を離れたため位置情報の取得を中止しました。');};
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => {
      generation.current++;
      stop.current?.();
      stop.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);
  const start = () => {
    stop.current?.();
    stop.current = null;
    const run = ++generation.current;
    setPosition(null);
    if (!navigator.geolocation) {
      setLocating(false);
      setMessage('このブラウザでは位置情報を使えません。駅入口までの実測時間を入力してください。');
      return;
    }
    setLocating(true);
    setMessage('現在地を確認しています（最大20秒）。');
    let finished = false;
    const release = collectPosition(navigator.geolocation, sample => {
      if (run !== generation.current) return;
      setPosition(sample);
      setMessage('より正確な位置を確認中です（最大20秒）。');
    }, result => {
      finished = true;
      if (run !== generation.current) return;
      stop.current = null;
      setPosition(result.position);
      setLocating(false);
      const quality = positionStatus(result.position, Date.now());
      setMessage(quality === 'fresh' ? '現在地を更新しました' : result.position
        ? quality === 'stale' ? '新しい位置を取得できませんでした。位置情報の設定を確認して、再取得してください。'
          : '現在地の誤差が大きいため、出発目安を計算できません。位置を取り直すか、実測時間を使ってください。'
        : geolocationError(result.errorCode ?? 2));
    });
    if (!finished) stop.current = release;
  };
  return {position, locating, message, start, cancel};
}

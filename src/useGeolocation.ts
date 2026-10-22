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
      setMessage('この環境は位置情報に対応していません。登録地点を使えます。');
      return;
    }
    setLocating(true);
    setMessage('現在地を確認しています。より正確な位置を最大20秒待ちます…');
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
          : '20秒確認しましたが、徒歩判定に必要な精度に届きませんでした。下の案内をご確認ください。'
        : geolocationError(result.errorCode ?? 2));
    });
    if (!finished) stop.current = release;
  };
  return {position, locating, message, start, cancel};
}

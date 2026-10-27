import React, {lazy,Suspense} from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import './decision-summary.css';
import {startPwaUpdates} from './serviceWorkerUpdates';
// Vite removes this import branch from normal production bundles, including its CSS.
const comparisonEnabled=import.meta.env.DEV||import.meta.env.MODE==='comparison';
const DesignPreview=comparisonEnabled?lazy(()=>import('./design/DesignPreview')):null;
const design=comparisonEnabled?new URLSearchParams(location.search).get('design'):null;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{DesignPreview&&(design==='board'||design==='action'||design==='favorites')?<Suspense fallback={<p role="status">比較画面を読み込んでいます…</p>}><DesignPreview design={design}/></Suspense>:<App comparison={design==='baseline'}/>}</React.StrictMode>);
if(import.meta.env.PROD)startPwaUpdates();
import './departure-timeline.css';
import './action-live.css';
import './adopted-ui.css';

import './signal-ui.css';

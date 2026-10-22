import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import {startPwaUpdates} from './serviceWorkerUpdates';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if(import.meta.env.PROD)startPwaUpdates();

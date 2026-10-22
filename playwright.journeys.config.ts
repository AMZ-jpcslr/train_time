import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.JOURNEY_URL??'http://127.0.0.1:5173';
export default defineConfig({
 testDir:'./tests/journeys',
 use:{baseURL,timezoneId:'Asia/Tokyo',trace:'retain-on-failure',serviceWorkers:'block'},
 webServer:process.env.JOURNEY_URL?undefined:{command:'npm run dev -- --port 5173',url:baseURL,reuseExistingServer:true},
 projects:[
  ...[320,360,390].map(width=>({name:`mobile-${width}`,use:{...devices['iPhone 13'],defaultBrowserType:'chromium' as const,viewport:{width,height:640},deviceScaleFactor:1}})),
  {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:720}}},
 ],
});

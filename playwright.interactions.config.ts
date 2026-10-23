import {defineConfig,devices} from '@playwright/test';
const baseURL=process.env.INTERACTION_URL??'http://127.0.0.1:5173';
export default defineConfig({
 testDir:'./tests/interactions',outputDir:'test-results/interactions',workers:2,
 use:{baseURL,timezoneId:'Asia/Tokyo',serviceWorkers:'block',trace:'retain-on-failure'},
 webServer:process.env.INTERACTION_URL?undefined:{command:'npm run dev -- --port 5173',url:baseURL,reuseExistingServer:true},
 projects:[
  ...[320,390].map(width=>({name:`touch-${width}`,use:{...devices['iPhone 13'],defaultBrowserType:'chromium' as const,viewport:{width,height:844},deviceScaleFactor:1}})),
  ...[320,390,1280].map(width=>({name:`webkit-${width}`,use:{browserName:'webkit' as const,viewport:{width,height:844},isMobile:width<760,hasTouch:width<760,deviceScaleFactor:1,launchOptions:process.env.WEBKIT_EXECUTABLE_PATH?{executablePath:process.env.WEBKIT_EXECUTABLE_PATH}:undefined}})),
 ],
});

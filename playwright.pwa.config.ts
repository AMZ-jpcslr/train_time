import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/pwa',outputDir:'test-results/pwa',use:{baseURL:'http://127.0.0.1:4173'},webServer:{command:'npm run preview -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:true}});

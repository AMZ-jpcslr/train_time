import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import {availableParallelism} from 'node:os';
import react from '@vitejs/plugin-react';
// @ts-expect-error Native Node backend shared by Vite dev and preview.
import {localApiPlugin} from './server/api.mjs';
// @ts-expect-error Build-only metadata utility; no environment object is exposed to the client.
import {transformSocialHtml,normalizeSocialOrigin} from './scripts/social-metadata.mjs';
export default defineConfig(({mode})=>{
 const env={...process.env,...loadEnv(mode,process.cwd(),'')};
 const origin=normalizeSocialOrigin(env.APP_ORIGIN||(env.VERCEL_PROJECT_PRODUCTION_URL?`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`:'https://train-time-three.vercel.app'));
 return {
 plugins: [react(),localApiPlugin(env),{name:'social-preview',transformIndexHtml:(html:string)=>transformSocialHtml(html,origin)}],
 server: {
  // Source acquisition caches are not UI assets; watching them caused EBUSY on Windows.
  watch: { ignored: ['**/.cache/**','**/docs/screenshots/**','**/test-results/**'] },
  fs: { deny: ['.env','.env.*','*.{crt,pem}','**/.git/**','**/.cache/**'] },
 },
 test: { include: ['tests/**/*.test.ts'],maxWorkers:Math.min(4,availableParallelism()) },
};});

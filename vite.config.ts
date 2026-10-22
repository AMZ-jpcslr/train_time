import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Native Node backend shared by Vite dev and preview.
import {localApiPlugin} from './server/api.mjs';
export default defineConfig(({mode})=>({
 plugins: [react(),localApiPlugin({...process.env,...loadEnv(mode,process.cwd(),'')})],
 server: {
  // Source acquisition caches are not UI assets; watching them caused EBUSY on Windows.
  watch: { ignored: ['**/.cache/**','**/docs/screenshots/**','**/test-results/**'] },
  fs: { deny: ['.env','.env.*','*.{crt,pem}','**/.git/**','**/.cache/**'] },
 },
 test: { include: ['tests/**/*.test.ts'] },
}));

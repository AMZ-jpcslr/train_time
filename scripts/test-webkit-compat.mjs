// Isolate a compatible official Playwright/WebKit pair without changing dependencies.
// Usage: node scripts/test-webkit-compat.mjs <absolute @playwright/test directory>
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const runner=resolve(process.argv[2]??'node_modules/@playwright/test');
const root=process.cwd(),out=resolve('.cache/webkit-compat');
await mkdir(out,{recursive:true});
const module=pathToFileURL(resolve(runner,'index.mjs')).href;
const replaceRunner=s=>s.replaceAll("'@playwright/test'",JSON.stringify(module));
let runtime=replaceRunner(await readFile('tests/fixtures/runtime.ts','utf8'));
for(const file of ['jr','entrances'])runtime=runtime.replace(`new URL('../../src/data/${file}.json',import.meta.url)`,JSON.stringify(resolve(`src/data/${file}.json`)));
await writeFile(resolve(out,'runtime.ts'),runtime);
const spec=replaceRunner(await readFile('tests/interactions/timeline.spec.ts','utf8')).replace("'../fixtures/runtime'","'./runtime'");
await writeFile(resolve(out,'timeline.spec.ts'),spec);
let config=replaceRunner(await readFile('playwright.interactions.config.ts','utf8')).replace("'./tests/interactions'",JSON.stringify(out)).replace("'test-results/interactions'",JSON.stringify(resolve('test-results/webkit-compat')));
await writeFile(resolve(out,'playwright.config.ts'),config);
const result=spawnSync(process.execPath,[resolve(runner,'cli.js'),'test','--config',resolve(out,'playwright.config.ts'),'--project=webkit-*',...process.argv.slice(3)],{cwd:root,stdio:'inherit',env:process.env});
process.exit(result.status??1);

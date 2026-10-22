import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
if (!response.ok) throw new Error(`Holiday fetch: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const csv = new TextDecoder('shift_jis').decode(bytes);
const days = Object.fromEntries(csv.trim().split(/\r?\n/).slice(1).map(row => {
  const [date, name] = row.split(',');
  const [y,m,d] = date.split('/');
  return [`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, name];
}));
if (days['2026-09-22'] !== '休日' || !days['2026-11-03']) throw new Error('Holiday schema check failed');
const years = [...new Set(Object.keys(days).map(d => Number(d.slice(0,4))))];
const result = {sourceUrl:url, retrievedAt:new Date().toISOString(), sha256:createHash('sha256').update(bytes).digest('hex'), minYear:Math.min(...years),maxYear:Math.max(...years), days};
await mkdir('src/data',{recursive:true});
await writeFile('src/data/holidays.json', JSON.stringify(result,null,2)+'\n');
console.log(`Verified ${Object.keys(days).length} official holidays; ${result.minYear}–${result.maxYear}`);

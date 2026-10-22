import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
// @ts-expect-error Node acquisition module
import { readJrCache, obtain, mergeJrEvidence } from '../scripts/import-jr.mjs';
const url='https://example.invalid/table',stamp='2026-10-22T03:16:12.547Z',html='synthetic timetable cache';
const sha256=createHash('sha256').update(html).digest('hex');
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'train-time-jr-')),target=path.join(dir,'table.html'),evidencePath=path.join(dir,'evidence.json'),dataPath=path.join(dir,'data.json');
 await writeFile(target,html);
 await writeFile(evidencePath,JSON.stringify([{id:'test-day',sourceUrl:url,sha256,retrievedAt:stamp}]));
 await writeFile(dataPath,JSON.stringify([{id:'test-day',sourceUrl:url,retrievedAt:stamp}]));
 return {dir,target,evidencePath,dataPath};
}
describe('JR cache provenance and no implicit fetch',()=>{
 it('migrates only matching JSON/URL/SHA evidence and ignores changed mtime',async()=>{
  const f=await fixture();await utimes(f.target,new Date('2030-01-01'),new Date('2030-01-01'));
  expect((await readJrCache(f.target,url,f)).retrievedAt).toBe(stamp);
  expect(JSON.parse(await readFile(f.target+'.meta.json','utf8'))).toEqual({sourceUrl:url,sha256,retrievedAt:stamp});
  await utimes(f.target,new Date('2040-01-01'),new Date('2040-01-01'));
  expect((await readJrCache(f.target,url,f)).retrievedAt).toBe(stamp);
 });
 it('rejects legacy timestamp evidence inconsistent with saved JSON',async()=>{
  const f=await fixture();await writeFile(f.dataPath,JSON.stringify([{id:'test-day',sourceUrl:url,retrievedAt:'2040-01-01T00:00:00Z'}]));
  await expect(readJrCache(f.target,url,f)).rejects.toThrow('--refresh');
 });
 it('rejects modified HTML, mismatching URL, invalid sidecar or missing evidence',async()=>{
  const f=await fixture();await readJrCache(f.target,url,f);
  await expect(readJrCache(f.target,url+'?other',f)).rejects.toThrow('--refresh');
  await writeFile(f.target,html+'changed');await expect(readJrCache(f.target,url,f)).rejects.toThrow('--refresh');
  await writeFile(f.target+'.meta.json','{');await expect(readJrCache(f.target,url,f)).rejects.toThrow('--refresh');
  const other=await fixture();await writeFile(other.evidencePath,'[]');await expect(readJrCache(other.target,url,other)).rejects.toThrow('--refresh');
 });
 it('requires --refresh for missing cache without calling the network',async()=>{
  const f=await fixture(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  try{await expect(obtain('missing.html',url,f.dir,false,f)).rejects.toThrow('--refresh');expect(fetcher).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
 });
 it('records unknown legacy index acquisition honestly and cannot use it as timetable freshness',async()=>{
  const f=await fixture();const navigation={station:{routes:[['east','試験線','東方面']]},day:'2026-10-22'};
  const index='<select id="dateSelector"><option selected value="2026-10-22"></option></select><table class="timetable"><tr><th>試験線</th><td><a onclick="link(123)">東方面</a></td></tr></table>';
  const sourceUrl='https://timetable.jr-odekake.net/station-timetable/123?date=20261022';
  await writeFile(f.target,index);await writeFile(f.evidencePath,JSON.stringify([{id:'test-day',indexUrl:url,sourceUrl,retrievedAt:stamp}]));await writeFile(f.dataPath,JSON.stringify([{id:'test-day',sourceUrl,retrievedAt:stamp}]));
  const result=await readJrCache(f.target,url,{...f,navigation});expect(result.retrievedAt).toBeNull();expect(result.locallyCheckedAt).toBeTruthy();
  await expect(readJrCache(f.target,url,f)).rejects.toThrow('--refresh');
 });
 it('merges a future date without losing prior date validation evidence',()=>{
  const old={id:'station-east-2026-10-22',sha256:'old'},next={id:'station-east-2026-10-23',sha256:'next'};
  expect(mergeJrEvidence([old],[next])).toEqual([old,next]);
  expect(mergeJrEvidence([old,next],[{...next,sha256:'updated'}])).toEqual([old,{...next,sha256:'updated'}]);
 });
});

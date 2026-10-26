import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Native Node converter shared with offline tests
import { kaiganNetwork, kaiganDepartures, coverageRows, NAMES, verifyCurrentEast, LOCAL_HASH, readPinnedReview, approveCandidate, acquireCurrent, MAX_SOURCE_BYTES } from '../scripts/import-kobe-kaigan.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import candidate from '../src/data/kobe-kaigan-candidate.json';
import stations from '../src/data/kobe-kaigan-stations.json';
import evidence from '../docs/kobe-kaigan-followup-20261026-validation.json';
import approved from '../src/data/kobe-kaigan.json';
import provenance from '../docs/kobe-kaigan-followup-20261026-source/provenance.json';
import { availability, departureEpoch, serviceDate, selectTable, upcoming } from '../src/domain/time';
import type { Timetable } from '../src/domain/types';

const buffer=readFileSync(new URL('../docs/kobe-kaigan-followup-20261026-source/open_kaigan_w_east_r080314.csv',import.meta.url));
const reviewBytes=readFileSync(new URL('../docs/kobe-kaigan-independent-20261026.json',import.meta.url));
const csv=new TextDecoder('shift_jis',{fatal:true}).decode(buffer);
const network=kaiganNetwork(csv,'east');
describe('Kaigan current retained source',()=>{
  it('preserves original hash, unknown acquisition date and partial verification',()=>{
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(LOCAL_HASH);
    expect(evidence.source.retrievalTimeKnown).toBe(false);
    expect(candidate).toHaveLength(9);
    expect(candidate.reduce((n,t)=>n+t.departures.length,0)).toBe(900);
    for(const t of candidate){
      expect(t.sourceAcquisition.kind).toBe('retained-official-download');
      expect(t.sourceAcquisition.downloadedAt).toBeNull();
      expect(t.retrievedAt).toBe(t.sourceAcquisition.importedAt);
      expect(t.verification).toBe('partial');
      expect(availability(t as Timetable,'2026-10-26',Date.parse(t.checkedAt))).toBe('unverified');
    }
  });
  it('ignores only fully blank spacer columns, preserving original column references',()=>{
    expect(network.excludedBlankColumns).toEqual([2]);
    expect(kaiganDepartures(network,'新長田').sourceColumns[0]).toBe(3);
    // A partial spacer is a broken train, not silently discarded.
    expect(()=>kaiganNetwork(csv.replace(/始発駅\s*,,/,'始発駅,新長田,'),'east')).toThrow();
    expect(()=>kaiganNetwork(csv,'west')).toThrow('order');
  });
  it('excludes terminal arrivals but retains short runs to Misaki-koen',()=>{
    expect(kaiganDepartures(network,'三宮・花時計前').departures).toEqual([]);
    expect(kaiganDepartures(network,'三宮・花時計前').excludedArrivalColumns).toHaveLength(101);
    expect(kaiganDepartures(network,'御崎公園').excludedArrivalColumns).toHaveLength(2);
    expect(kaiganDepartures(network,'新長田').departures.at(-1)).toMatchObject({time:'23:56',destination:'御崎公園'});
    expect(kaiganDepartures(network,'苅藻').departures.at(-1)).toMatchObject({time:'23:59',destination:'御崎公園'});
    for(const t of candidate) expect(t.departures.some(d=>d.destination===stations.find(s=>s.id===t.stationId)?.name)).toBe(false);
  });
  it('matches independent current HTML samples and distinguishes the obsolete CKAN bytes',()=>{
    expect(verifyCurrentEast(network)).toHaveLength(3);
    const central=evidence.differences.find(d=>d.name==='中央市場前')!;
    expect(central.oldCount).toBe(117);expect(central.currentCount).toBe(101);
    expect(central.added).toContain('05:44/三宮・花時計前');
    expect(central.removed).toContain('05:43/三宮・花時計前');
  });
  it('represents 10 line stations, 18 directions, 36 expected tables, 27 missing',()=>{
    expect(stations).toHaveLength(10);
    expect(stations.reduce((n,s)=>n+s.directions.length,0)).toBe(18);
    expect(stations.find(s=>s.code==='K10')?.physicalStationId).toBe('kobe-s09');
    expect(stations.every(s=>s.coordinateKind==='station-centre-not-entrance')).toBe(true);
    const rows=coverageRows(['w-east']);expect(rows).toHaveLength(36);
    expect(rows.filter((r:{currentCsvAvailable:boolean})=>!r.currentCsvAvailable)).toHaveLength(27);
    expect(new Set(rows.map((r:{stationId:string;direction:string;dayType:string})=>`${r.stationId}/${r.direction}/${r.dayType}`)).size).toBe(36);
    expect(NAMES).toHaveLength(10);
  });
  it('never substitutes weekday for holidays and retains midnight service-day semantics',()=>{
    const tables=candidate as Timetable[];
    expect(selectTable(tables,'kobe-k05','east','2026-10-26')).toBeDefined();
    expect(selectTable(tables,'kobe-k05','east','2026-10-24')).toBeUndefined();
    expect(selectTable(tables,'kobe-k05','east','2026-11-03')).toBeUndefined();
    expect(selectTable(tables,'kobe-k05','west','2026-10-26')).toBeUndefined();
    const t=tables.find(t=>t.stationId==='kobe-k02')!,last=departureEpoch('2026-10-26','24:00');
    expect(t.departures.at(-1)?.time).toBe('24:00');
    expect(serviceDate(last)).toBe('2026-10-26');
    expect(upcoming(t,'2026-10-26',last-1).at(-1)?.time).toBe('24:00');
    expect(upcoming(t,'2026-10-26',last)).toEqual([]);
    expect(availability(t,'2026-03-13',Date.parse(t.checkedAt))).toBe('expired');
    expect(availability(t,'2026-03-14',Date.parse(t.checkedAt))).toBe('unverified');
  });
});

describe('Kaigan explicit approval with pinned independent evidence',()=>{
  it('reproduces only nine weekday eastbound approved tables with a fixed review date',()=>{
    const review=readPinnedReview(reviewBytes);
    expect(approveCandidate(candidate,review,buffer,provenance)).toEqual(approved);
    expect(approved).toHaveLength(9);
    for(const table of approved){
      expect(table.verification).toBe('verified');
      expect(table.checkedAt).toBe(review.checkedAt);
      expect(table.sourceAcquisition.downloadedAt).toBeNull();
      expect(table.notes.join(' ')).toContain('全900便の独立突合ではありません');
    }
  });
  it('rejects changed review bytes, missing scope, altered CSV and changed candidate times',()=>{
    expect(()=>readPinnedReview(Buffer.concat([reviewBytes,Buffer.from(' ')]))).toThrow('review hash');
    const review=readPinnedReview(reviewBytes);
    expect(()=>approveCandidate(candidate,{...review,samples:review.samples.slice(1)},buffer,provenance)).toThrow('scope');
    expect(()=>approveCandidate(candidate,review,Buffer.concat([buffer,Buffer.from(' ')]),provenance)).toThrow('hash');
    const altered=structuredClone(candidate);altered[0].departures[1].time='05:01';
    expect(()=>approveCandidate(altered,review,buffer,provenance)).toThrow('departures');
    const changedReview=structuredClone(review);changedReview.samples[0].expected.first.time='05:01';
    expect(()=>approveCandidate(candidate,changedReview,buffer,provenance)).toThrow('sample');
    expect(()=>approveCandidate(candidate,{...review,checkedAt:'2020-01-01T00:00:00Z'},buffer,provenance)).toThrow('review date');
  });
});

describe('Kaigan bounded acquisition without network or filesystem writes',()=>{
  function recorder() {
    const files=new Map<string,Buffer>();
    return {files,saveFile:async(name:string,bytes:Uint8Array|string)=>{files.set(name,typeof bytes==='string'?Buffer.from(bytes):Buffer.from(bytes));},metadata:()=>[...files.entries()].filter(([name])=>name.endsWith('.meta.json')).map(([,bytes])=>JSON.parse(bytes.toString()))};
  }
  it('records an empty 202 challenge and stops without fetching the other three links',async()=>{
    const saved=recorder(),fetcher=vi.fn(async()=>new Response(null,{status:202,headers:{'x-amzn-waf-action':'challenge','set-cookie':'private-cookie','x-token':'private-token'}}));
    await expect(acquireCurrent({fetcher,directory:'test-evidence',saveFile:saved.saveFile})).rejects.toThrow('HTTP 202');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const meta=saved.metadata()[0];expect(meta).toMatchObject({status:202,accepted:false,bytes:0,hashScope:'complete-response',headers:{'x-amzn-waf-action':'challenge'}});
    expect(JSON.stringify(meta)).not.toMatch(/private-cookie|private-token|set-cookie|x-token/);
  });
  it('requests manual redirects, preserves 302 location and a bounded prefix, and never follows it',async()=>{
    const saved=recorder(),fetcher=vi.fn(async(_url:string,options:{redirect:string})=>{
      expect(options.redirect).toBe('manual');
      return new Response('redirect body'.repeat(1000),{status:302,headers:{location:'https://example.invalid/redirect'}});
    });
    await expect(acquireCurrent({fetcher,directory:'test-evidence',saveFile:saved.saveFile})).rejects.toThrow('HTTP 302');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(saved.metadata()[0]).toMatchObject({status:302,location:'https://example.invalid/redirect',accepted:false,bytes:4096,truncated:true,hashScope:'retained-prefix'});
  });
  it('cancels a streaming body over 2 MB and retains only a small failure prefix',async()=>{
    const saved=recorder(),cancel=vi.fn();
    const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_SOURCE_BYTES+1));},cancel}),{status:200});
    const fetcher=vi.fn(async()=>response);
    await expect(acquireCurrent({fetcher,directory:'test-evidence',saveFile:saved.saveFile})).rejects.toThrow('body limit exceeded');
    expect(fetcher).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalledTimes(1);
    expect(saved.metadata()[0]).toMatchObject({status:200,accepted:false,retainedBytesBeforePrefix:MAX_SOURCE_BYTES,bytes:4096,truncated:true,hashScope:'retained-prefix'});
    expect([...saved.files.entries()].filter(([name])=>name.endsWith('.response.bin'))[0][1]).toHaveLength(4096);
  });
  it.each([
    ['empty',()=>new Response(null,{status:200})],
    ['WAF',()=>new Response('challenge',{status:200,headers:{'x-amzn-waf-action':'challenge'}})],
  ])('rejects a 200 %s response before parsing',async(_name,makeResponse)=>{
    const saved=recorder(),fetcher=vi.fn(async()=>makeResponse());
    await expect(acquireCurrent({fetcher,directory:'test-evidence',saveFile:saved.saveFile})).rejects.toThrow('HTTP 200');
    expect(fetcher).toHaveBeenCalledTimes(1);expect(saved.metadata()[0].accepted).toBe(false);
  });
  it('accepts and parses a small valid official CSV, then stops on the next failed response',async()=>{
    const saved=recorder(),fetcher=vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(buffer),{status:200,headers:{'content-type':'text/csv'}})).mockResolvedValueOnce(new Response(null,{status:202}));
    await expect(acquireCurrent({fetcher,directory:'test-evidence',saveFile:saved.saveFile})).rejects.toThrow('HTTP 202');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(saved.metadata()[0]).toMatchObject({status:200,accepted:true,bytes:8258,truncated:false,hashScope:'complete-response',sha256:LOCAL_HASH});
    expect(saved.metadata()[1]).toMatchObject({status:202,accepted:false});
    expect([...saved.files.entries()].find(([name])=>name.endsWith('open_kaigan_w_east_r080314.csv'))?.[1]).toEqual(buffer);
  });
});

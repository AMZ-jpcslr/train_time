import {describe,it,expect} from 'vitest';
import {bundledTables} from '../src/data/bundled';
import {previewModel,PREVIEW_TIME,type Scenario} from '../src/design/previewModel';
describe('comparison uses real timetables and the production calculation',()=>{
 const model=(scenario:Scenario='normal',walk:number|null=8,now=PREVIEW_TIME)=>previewModel(bundledTables,'kobe-gakuentoshi','east',scenario,walk,3,null,now);
 it('selects a real departure with sufficient departure margin',()=>{const m=model();expect(m.table?.departures.some(d=>d.time===m.selected?.time)).toBe(true);expect(m.leaving?.leaveAt).toBe(m.selected!.epoch-11*60000);expect(m.result?.status).toBe('comfortable');});
 it.each(['unsupported','missing','expired','failed','loading'] as Scenario[])('%s never substitutes another timetable',scenario=>{expect(model(scenario).selected).toBeUndefined();expect(model(scenario).leaving).toBeNull();});
 it('reference data and unknown walking time never produce a departure judgment',()=>{expect(model('reference').leaving).toBeNull();expect(model('denied',null).leaving).toBeNull();});
 it('freshness uses the real clock even in the fixed-time comparison',()=>{expect(model('normal',8,Date.parse('2027-01-01T00:00:00Z')).leaving).toBeNull();});
 it('after the last departure is distinct from missing data',()=>{expect(model('ended').table).toBeDefined();expect(model('ended').future).toHaveLength(0);expect(model('ended').issue).toBe('ended');});
 it.each(['offline','ended'] as Scenario[])('%s cannot hide the absence of the selected day',scenario=>{const m=previewModel(bundledTables,'jr-osaka','east',scenario,8,3,null,PREVIEW_TIME);expect(m.issue).toBe('missing');expect(m.leaving).toBeNull();});
});

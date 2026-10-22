import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
class WorkerStub extends EventTarget {state='installing';postMessage=vi.fn();}
let worker:WorkerStub,registration:ReturnType<typeof makeRegistration>,container:EventTarget&{controller:unknown;register:ReturnType<typeof vi.fn>},win:EventTarget&{location:{reload:ReturnType<typeof vi.fn>}},doc:EventTarget&{readyState:string;visibilityState:string},nav:{serviceWorker:typeof container;onLine:boolean};
const makeRegistration=()=>Object.assign(new EventTarget(),{waiting:null as WorkerStub|null,installing:null as WorkerStub|null,update:vi.fn(async()=>{})});
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers();worker=new WorkerStub();registration=makeRegistration();
 container=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>registration)});
 win=Object.assign(new EventTarget(),{location:{reload:vi.fn()}});doc=Object.assign(new EventTarget(),{readyState:'complete',visibilityState:'visible'});nav={serviceWorker:container,onLine:true};
 vi.stubGlobal('navigator',nav);vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe('PWA client lifecycle',()=>{
 it('announces an already waiting update and reloads exactly once after activation',async()=>{
  registration.waiting=worker;const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();
  expect(container.register).toHaveBeenCalledWith('/sw.js',{updateViaCache:'none'});expect(pwa.getPwaUpdate().phase).toBe('available');expect(win.location.reload).not.toHaveBeenCalled();
  pwa.applyPwaUpdate();expect(worker.postMessage).toHaveBeenCalledWith({type:'SKIP_WAITING'});container.dispatchEvent(new Event('controllerchange'));container.dispatchEvent(new Event('controllerchange'));expect(win.location.reload).toHaveBeenCalledTimes(1);
 });
 it('does not reload on first installation but does reload on the next release in the same tab',async()=>{
  container.controller=null;const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();
  container.controller={};container.dispatchEvent(new Event('controllerchange'));expect(win.location.reload).not.toHaveBeenCalled();
  registration.waiting=worker;await pwa.checkPwaUpdate(true);pwa.applyPwaUpdate();container.dispatchEvent(new Event('controllerchange'));expect(win.location.reload).toHaveBeenCalledTimes(1);
 });
 it('checks on visible resume with a one-minute cooldown, and immediately on restored connectivity',async()=>{
  const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();expect(registration.update).toHaveBeenCalledTimes(1);
  doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('pageshow'));await tick();expect(registration.update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60001);doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));await tick();expect(registration.update).toHaveBeenCalledTimes(1);
  doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await tick();expect(registration.update).toHaveBeenCalledTimes(2);
  nav.onLine=false;await pwa.checkPwaUpdate(true);expect(pwa.getPwaUpdate().phase).toBe('offline');expect(registration.update).toHaveBeenCalledTimes(2);
  nav.onLine=true;win.dispatchEvent(new Event('online'));await tick();expect(registration.update).toHaveBeenCalledTimes(3);
 });
 it('shows an installation failure without reloading or claiming the new version is ready',async()=>{
  registration.installing=worker;const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();worker.state='redundant';worker.dispatchEvent(new Event('statechange'));
  expect(pwa.getPwaUpdate().phase).toBe('error');expect(win.location.reload).not.toHaveBeenCalled();
 });
 it('retries after registration failed instead of leaving the update button inert',async()=>{
  container.register.mockRejectedValueOnce(new Error('offline'));const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();expect(pwa.getPwaUpdate().phase).toBe('error');
  await pwa.checkPwaUpdate(true);await tick();expect(container.register).toHaveBeenCalledTimes(2);expect(registration.update).toHaveBeenCalledTimes(1);expect(pwa.getPwaUpdate().phase).toBe('current');
 });
 it('reports an unacknowledged activation so the user can retry',async()=>{
  registration.waiting=worker;const pwa=await import('../src/serviceWorkerUpdates');pwa.startPwaUpdates();await tick();pwa.applyPwaUpdate();await vi.advanceTimersByTimeAsync(10001);expect(pwa.getPwaUpdate().phase).toBe('error');expect(win.location.reload).not.toHaveBeenCalled();
 });
});

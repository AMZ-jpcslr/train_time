import {afterEach,describe,expect,it,vi} from 'vitest';
import {getRuntimeConfig,parseRuntimeConfig} from '../src/shared/api-client';

afterEach(()=>vi.unstubAllGlobals());

describe('runtime config network boundary',()=>{
 it('keeps optional capabilities independent of walking configuration',()=>{
  expect(parseRuntimeConfig({enabled:false,odptChallenge:{enabled:true,configured:true,reason:null}})).toMatchObject({enabled:false,odptChallenge:{enabled:true}});
  expect(parseRuntimeConfig({enabled:true,western:{enabled:true,coverage:[{operator:'JR西日本',line:'JR神戸線',internal:'omit'},null]}}).western).toEqual({enabled:true,coverage:[{operator:'JR西日本',line:'JR神戸線'}]});
 });
 it('does not trust string flags, dangerous links or unknown response properties',()=>{
  expect(()=>parseRuntimeConfig({enabled:'true'})).toThrow();
  const value=parseRuntimeConfig({enabled:true,privacyUrl:'javascript:alert(1)',contactEmail:'x\ny@example.test',token:'secret',odptChallenge:{enabled:'true'}});
  expect(value.privacyUrl).toBeNull();expect(value.contactEmail).toBeNull();expect(value.odptChallenge?.enabled).toBe(false);expect(value).not.toHaveProperty('token');
 });
 it('rejects HTTP failures before treating their JSON as configuration',async()=>{
  const json=vi.fn();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503,json}));
  await expect(getRuntimeConfig()).rejects.toThrow('503');expect(json).not.toHaveBeenCalled();
 });
 it('passes cancellation and decodes successful responses without persisting server state',async()=>{
  const signal=new AbortController().signal;const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({enabled:true,provider:'経路サービス',privacyUrl:'https://example.test/privacy',contactEmail:null})});vi.stubGlobal('fetch',request);
  await expect(getRuntimeConfig(signal)).resolves.toMatchObject({enabled:true,provider:'経路サービス'});
  expect(request).toHaveBeenCalledWith('/api/config',expect.objectContaining({signal,credentials:'same-origin',redirect:'error',headers:{Accept:'application/json'}}));
 });
 it('rejects malformed response bodies instead of creating a typed success',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({error:'unavailable'})}));
  await expect(getRuntimeConfig()).rejects.toThrow('Invalid runtime configuration');
 });
});

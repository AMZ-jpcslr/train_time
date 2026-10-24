import {describe,it,expect,vi} from 'vitest';
import {request} from 'node:http';
// @ts-expect-error Local setup server, no acquired facts/credentials
import {startTokenSetup} from '../scripts/setup-odpt-token.mjs';
const sample='fictional_setup_test_token_12345';
describe('loopback token entry',()=>{
 it('accepts a legitimate no-referrer form Origin:null only at the secret one-time path and never echoes the token',async()=>{
  const saveToken=vi.fn(async()=>{}),setup=await startTokenSetup({saveToken});
  try{
   const response=await fetch(setup.url),html=await response.text();expect(html).toContain('type="password"');expect(html).not.toContain(sample);expect(response.headers.get('cache-control')).toBe('no-store');
   const wrong=new URL(setup.url);wrong.pathname='/setup/'+'0'.repeat(48);expect((await fetch(wrong)).status).toBe(404);
   const bad=await fetch(setup.url,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:sample})});expect(bad.status).toBe(403);expect(saveToken).not.toHaveBeenCalled();
   const saved=await fetch(setup.url,{method:'POST',headers:{Origin:'null','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:sample})});
   expect(saved.status).toBe(200);const text=await saved.text();expect(text).toContain('暗号化して保存しました');expect(text).not.toContain(sample);expect(saveToken).toHaveBeenCalledExactlyOnceWith(sample);
  }finally{setup.server.close();}
 });
 it('rejects expired sessions, malformed bodies and untrusted Host values',async()=>{
  let clock=0;const saveToken=vi.fn(),setup=await startTokenSetup({saveToken,clock:()=>clock});
  try{
   expect((await fetch(setup.url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(403);
   expect((await fetch(setup.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'token=short'})).status).toBe(400);
   const untrustedHostStatus=await new Promise<number|undefined>((resolve,reject)=>{
    const req=request(setup.url,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();
   });
   expect(untrustedHostStatus).toBe(404);
   clock=16*60000;expect((await fetch(setup.url)).status).toBe(410);expect(saveToken).not.toHaveBeenCalled();
  }finally{setup.server.close();}
 });
});

import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// @ts-expect-error Local input helper with injected fake persistence
import {startTokenSetup,saveEncryptedToken} from '../../scripts/setup-odpt-token.mjs';
// @ts-expect-error Shared local Windows executable path
import {windowsPowerShell} from '../../server/windows-powershell.mjs';
test('actual browser form submits under no-referrer without exposing the fictional credential',async({page})=>{
 let saved='';const fake='fictional_browser_input_test_12345',setup=await startTokenSetup({saveToken:async(value:string)=>{saved=value;}});
 try{
  await page.goto(setup.url);await page.getByLabel('アクセストークン（入力は伏せ字）').fill(fake);await page.getByRole('button',{name:'暗号化してこのPCに保存'}).click();
  await expect(page.getByRole('heading',{name:'暗号化して保存しました'})).toBeVisible();expect(saved).toBe(fake);await expect(page.locator('body')).not.toContainText(fake);
 }finally{setup.server.close();}
});

for(const kind of ['challenge2026','standard'] as const)test(`browser submission writes a ${kind} DPAPI credential and Windows decrypts it without PATH`,async({page})=>{
 test.skip(process.platform!=='win32','Windows DPAPI integration');
 const storageDirectory=await mkdtemp(join(tmpdir(),'train-time-credential-test-'));
 const fake='fictional_dpapi_browser_test_12345';
 const otherKind=kind==='standard'?'challenge2026':'standard';
 // The second save previously failed when Set-Acl reapplied the protected DACL.
 await saveEncryptedToken('fictional_existing_credential_12345',{storageDirectory,kind:otherKind});
 const previousCiphertext=await readFile(join(storageDirectory,otherKind+'.dpapi'),'utf8');
 const setup=await startTokenSetup({kind,saveToken:(value:string)=>saveEncryptedToken(value,{storageDirectory,kind})});
 try{
  await page.goto(setup.url);await page.getByLabel('アクセストークン（入力は伏せ字）').fill(fake);await page.getByRole('button',{name:'暗号化してこのPCに保存'}).click();
  await expect(page.getByRole('heading',{name:'暗号化して保存しました'})).toBeVisible();
  const ciphertext=await readFile(join(storageDirectory,kind+'.dpapi'),'utf8');expect(ciphertext).not.toContain(fake);
  expect(await readFile(join(storageDirectory,otherKind+'.dpapi'),'utf8')).toBe(previousCiphertext);
  const {stdout}=await promisify(execFile)(windowsPowerShell,['-NoProfile','-NonInteractive','-File',resolve('scripts/odpt-token.ps1'),'-Read','-StorageDirectory',storageDirectory,'-CredentialName',kind],{windowsHide:true,env:{...process.env,PATH:''}});
  expect(stdout).toBe(fake);await expect(page.locator('body')).not.toContainText(fake);
 }finally{
  setup.server.close();
  if(dirname(resolve(storageDirectory))!==resolve(tmpdir())||!storageDirectory.includes('train-time-credential-test-'))throw Error('Unsafe test cleanup path');
  await rm(storageDirectory,{recursive:true,force:true});
 }
});

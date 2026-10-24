import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// @ts-expect-error Local input helper with injected fake persistence
import {startTokenSetup,saveEncryptedToken} from '../../scripts/setup-odpt-token.mjs';
test('actual browser form submits under no-referrer without exposing the fictional credential',async({page})=>{
 let saved='';const fake='fictional_browser_input_test_12345',setup=await startTokenSetup({saveToken:async(value:string)=>{saved=value;}});
 try{
  await page.goto(setup.url);await page.getByLabel('アクセストークン（入力は伏せ字）').fill(fake);await page.getByRole('button',{name:'暗号化してこのPCに保存'}).click();
  await expect(page.getByRole('heading',{name:'暗号化して保存しました'})).toBeVisible();expect(saved).toBe(fake);await expect(page.locator('body')).not.toContainText(fake);
 }finally{setup.server.close();}
});

test('browser submission writes a DPAPI credential and Windows decrypts it in an isolated test directory',async({page})=>{
 test.skip(process.platform!=='win32','Windows DPAPI integration');
 const storageDirectory=await mkdtemp(join(tmpdir(),'train-time-credential-test-'));
 const fake='fictional_dpapi_browser_test_12345';
 const setup=await startTokenSetup({saveToken:(value:string)=>saveEncryptedToken(value,{storageDirectory})});
 try{
  await page.goto(setup.url);await page.getByLabel('アクセストークン（入力は伏せ字）').fill(fake);await page.getByRole('button',{name:'暗号化してこのPCに保存'}).click();
  await expect(page.getByRole('heading',{name:'暗号化して保存しました'})).toBeVisible();
  const ciphertext=await readFile(join(storageDirectory,'challenge2026.dpapi'),'utf8');expect(ciphertext).not.toContain(fake);
  const {stdout}=await promisify(execFile)('pwsh.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/odpt-token.ps1'),'-Read','-StorageDirectory',storageDirectory],{windowsHide:true});
  expect(stdout).toBe(fake);await expect(page.locator('body')).not.toContainText(fake);
 }finally{
  setup.server.close();
  if(dirname(resolve(storageDirectory))!==resolve(tmpdir())||!storageDirectory.includes('train-time-credential-test-'))throw Error('Unsafe test cleanup path');
  await rm(storageDirectory,{recursive:true,force:true});
 }
});

import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const source=new URL('./social-card.html',import.meta.url);
const output=fileURLToPath(new URL('../public/og-image.png',import.meta.url));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
 // All artwork and licensed fonts are local. Generating a card needs no remote API.
 await page.route('**/*',route=>new URL(route.request().url()).protocol==='file:'?route.continue():route.abort());
 await page.goto(source.href,{waitUntil:'load'});
 await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.evaluate(()=>document.fonts.check('400 62px Zen')&&document.fonts.check('600 87px Barlow'));
 if(!fonts)throw new Error('The bundled social card fonts did not load.');
 await page.screenshot({path:output,type:'png'});
 const bytes=await readFile(output);
 if(bytes.readUInt32BE(16)!==1200||bytes.readUInt32BE(20)!==630)throw new Error('Unexpected social image dimensions.');
 console.log(`Social preview generated: public/og-image.png (1200 × 630, ${bytes.length} bytes)`);
}finally{await browser.close();}

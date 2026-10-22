import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const svg=await readFile('public/icon.svg','utf8');
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 for(const size of [192,512]){
  const data=await page.evaluate(async({svg,size})=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;canvas.getContext('2d').drawImage(image,0,0,size,size);return canvas.toDataURL('image/png').split(',')[1];},{svg,size});
  await writeFile(`public/icon-${size}.png`,Buffer.from(data,'base64'));
 }
}finally{await browser.close();}

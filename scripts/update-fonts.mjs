// Build-time only. SIL OFL fonts are hosted with the app; no user requests go to Google.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
await mkdir('public/fonts',{recursive:true});
const files=(await readdir('src',{recursive:true})).filter(name=>/\.(tsx?|json)$/.test(name));
const text=(await Promise.all(files.map(file=>readFile('src/'+file,'utf8')))).join('')+await readFile('scripts/social-card.html','utf8');
const chars=[...new Set([...text].filter(c=>c.codePointAt(0)>127))].sort();
const latin=Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('');
for(const [family,name,weight,characters] of [
 ['Zen Kaku Gothic New','zen-kaku-new','400',latin+chars.join('')],
 ['Barlow Condensed','barlow-condensed','600',latin],
]){
 const url=new URL('https://fonts.googleapis.com/css2');url.searchParams.set('family',`${family}:wght@${weight}`);url.searchParams.set('text',characters);url.searchParams.set('display','swap');
 const cssResponse=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}});if(!cssResponse.ok)throw Error('Font CSS '+cssResponse.status);
 const css=await cssResponse.text();const fontUrl=css.match(/src: url\((https:\/\/[^)]+)\)/)?.[1];if(!fontUrl)throw Error('Missing font URL');
 const response=await fetch(fontUrl);if(!response.ok)throw Error('Font asset '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());await writeFile(`public/fonts/${name}.woff2`,bytes);console.log(name,bytes.length,'bytes',characters.length,'characters');
 const ofl=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase().replaceAll(' ','')}/OFL.txt`);if(!ofl.ok)throw Error('Missing OFL');await writeFile(`public/fonts/${name}-OFL.txt`,await ofl.text());
}

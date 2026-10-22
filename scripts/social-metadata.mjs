import {load} from 'cheerio';

export const SOCIAL_TITLE='まにあう｜次の電車と、歩く時間。';
export const SOCIAL_DESCRIPTION='次の電車までの時間、徒歩経路、今いる場所にあと何分いられるかをまとめて確認。JR・阪急・阪神・地下鉄の予定時刻に基づく交通アプリです。';
export const SOCIAL_IMAGE_ALT='黒い電光掲示板風の背景に「まにあう」「次の電車と、歩く時間。」「あと何分、ここにいられる？」と表示した紹介画像';

/** Accept only an origin; never copy paths, credentials, or arbitrary markup into a card. */
export function normalizeSocialOrigin(value){
 if(typeof value!=='string'||!value.trim())throw new Error('Social preview origin must be an absolute HTTPS URL.');
 const input=value.trim();
 if(/[\u0000-\u0020\u007f<>"'`\\]/u.test(input))throw new Error('Social preview origin contains unsafe characters.');
 if(!/^https?:\/\/[^/?#]+\/?$/i.test(input))throw new Error('Social preview origin must be an absolute origin without a path, query, or fragment.');
 let url;
 try{url=new URL(input);}catch{throw new Error('Social preview origin must be an absolute HTTPS URL.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('Social preview origin requires HTTPS; HTTP is allowed only for local development.');
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||input.includes('?')||input.includes('#'))throw new Error('Social preview origin must not include credentials, a path, a query, or a fragment.');
 return url.origin;
}

const escapeAttribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/** Render metadata into the server-delivered HTML, before React or browser JavaScript. */
export function transformSocialHtml(html,origin){
 const base=normalizeSocialOrigin(origin);
 const url=base+'/';
 const image=base+'/og-image.png';
 const $=load(html.replace(/\n?<!-- train-time:social:start -->[\s\S]*?<!-- train-time:social:end -->\n?/g,''));
 const tags=[
  ['name','description',SOCIAL_DESCRIPTION],
  ['property','og:type','website'],
  ['property','og:title',SOCIAL_TITLE],
  ['property','og:description',SOCIAL_DESCRIPTION],
  ['property','og:url',url],
  ['property','og:image',image],
  ['property','og:image:type','image/png'],
  ['property','og:image:width','1200'],
  ['property','og:image:height','630'],
  ['property','og:image:alt',SOCIAL_IMAGE_ALT],
  ['property','og:site_name','まにあう'],
  ['property','og:locale','ja_JP'],
  ['name','twitter:card','summary_large_image'],
  ['name','twitter:title',SOCIAL_TITLE],
  ['name','twitter:description',SOCIAL_DESCRIPTION],
  ['name','twitter:image',image],
  ['name','twitter:image:alt',SOCIAL_IMAGE_ALT],
 ];
 if(base.startsWith('https:'))tags.push(['property','og:image:secure_url',image]);
 $('meta[property="og:image:secure_url"]').remove();
 for(const [key,name] of tags)$(`meta[${key}="${name}"]`).remove();
 $('link[rel="canonical"]').remove();
 $('head').append('\n<!-- train-time:social:start -->\n'+tags.map(([key,name,content])=>`<meta ${key}="${name}" content="${escapeAttribute(content)}">`).join('\n')+`\n<link rel="canonical" href="${escapeAttribute(url)}">\n<!-- train-time:social:end -->\n`);
 return $.html();
}

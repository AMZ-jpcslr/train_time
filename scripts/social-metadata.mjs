import {load} from 'cheerio';
import {SITE} from './site-metadata.mjs';
export {SITE} from './site-metadata.mjs';

export const SOCIAL_TITLE=SITE.title;
export const SOCIAL_DESCRIPTION=SITE.description;
export const SOCIAL_IMAGE_ALT=SITE.imageAlt;

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

/** Root has a trailing slash; asset paths do not. Queries never become canonical pages. */
export function canonicalUrl(origin,path='/'){
 if(typeof path!=='string'||!/^\/(?!\/)[A-Za-z0-9/_.-]*$/.test(path)||path.split('/').includes('..'))throw Error('Canonical path must be an internal path without query or fragment.');
 return new URL(path==='/'?path:path.replace(/\/+$/,''),normalizeSocialOrigin(origin)+'/').href;
}

/** @typedef {{'@type': 'WebSite'|'WebApplication', '@id': string, name: string, url: string, description?: string, inLanguage: string, [key: string]: unknown}} SiteEntity */
export function buildSiteJsonLd(origin){
 const url=canonicalUrl(origin);
 /** @type {SiteEntity[]} */
 const graph=[
  {'@type':'WebSite','@id':url+'#website',name:SITE.name,url,description:SITE.description,inLanguage:SITE.language},
  {'@type':'WebApplication','@id':url+'#app',name:SITE.name,url,description:SITE.description,inLanguage:SITE.language,applicationCategory:'TravelApplication',operatingSystem:'Web',isPartOf:{'@id':url+'#website'}},
 ];
 return {'@context':'https://schema.org','@graph':graph};
}

/** Only the actual public home page is indexable; no invented station routes or feeds. */
export function buildDiscoveryAssets(origin,{indexable=true}={}){
 const url=canonicalUrl(origin);
 return {
  'sitemap.xml':`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable?`\n  <url><loc>${escapeAttribute(url)}</loc></url>`:''}\n</urlset>\n`,
  'robots.txt':indexable?`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${canonicalUrl(origin,'/sitemap.xml')}\n`:'User-agent: *\nDisallow: /\n',
 };
}

/** Render metadata into the server-delivered HTML, before React or browser JavaScript. */
export function transformSocialHtml(html,origin,{indexable=true}={}){
 const base=normalizeSocialOrigin(origin);
 const url=canonicalUrl(base);
 const image=canonicalUrl(base,SITE.imagePath);
 const $=load(html.replace(/\n?<!-- train-time:social:start -->[\s\S]*?<!-- train-time:social:end -->\n?/g,''));
 $('title').remove();
 $('head').prepend(`<title>${escapeAttribute(SITE.title)}</title>`);
 const tags=[
  ['name','description',SOCIAL_DESCRIPTION],
  ['name','theme-color',SITE.themeColor],
  ['name','robots',indexable?'index, follow, max-image-preview:large':'noindex, nofollow'],
  ['property','og:type','website'],
  ['property','og:title',SOCIAL_TITLE],
  ['property','og:description',SOCIAL_DESCRIPTION],
  ['property','og:url',url],
  ['property','og:image',image],
  ['property','og:image:type','image/png'],
  ['property','og:image:width',SITE.imageWidth],
  ['property','og:image:height',SITE.imageHeight],
  ['property','og:image:alt',SOCIAL_IMAGE_ALT],
  ['property','og:site_name',SITE.name],
  ['property','og:locale',SITE.locale],
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
 $('script[data-site-structured-data]').remove();
 const jsonLd=JSON.stringify(buildSiteJsonLd(base)).replaceAll('<','\\u003c');
 $('head').append('\n<!-- train-time:social:start -->\n'+tags.map(([key,name,content])=>`<meta ${key}="${name}" content="${escapeAttribute(content)}">`).join('\n')+`\n<link rel="canonical" href="${escapeAttribute(url)}">\n<script type="application/ld+json" data-site-structured-data>${jsonLd}</script>\n<!-- train-time:social:end -->\n`);
 return $.html();
}

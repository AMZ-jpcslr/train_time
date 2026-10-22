import {describe,expect,it} from 'vitest';
import {load} from 'cheerio';
import {readFileSync} from 'node:fs';
// @ts-expect-error Pure build helper is an intentionally shared native ES module.
import {normalizeSocialOrigin,transformSocialHtml,SOCIAL_DESCRIPTION,SOCIAL_TITLE} from '../scripts/social-metadata.mjs';

const html='<!doctype html><html lang="ja"><head><title>まにあう</title><meta name="theme-color" content="#0b1013"><link rel="manifest" href="/manifest.webmanifest"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

describe('server-rendered social metadata',()=>{
 it('provides complete absolute Open Graph and large-image Twitter metadata before React',()=>{
  const output=transformSocialHtml(html,'https://preview.example.test');const $=load(output);
  const property=(name:string)=>$(`meta[property="${name}"]`).attr('content');const name=(key:string)=>$(`meta[name="${key}"]`).attr('content');
  expect(name('description')).toBe(SOCIAL_DESCRIPTION);expect(property('og:title')).toBe(SOCIAL_TITLE);expect(property('og:description')).toBe(SOCIAL_DESCRIPTION);
  expect(property('og:type')).toBe('website');expect(property('og:site_name')).toBe('まにあう');expect(property('og:locale')).toBe('ja_JP');
  expect(property('og:url')).toBe('https://preview.example.test/');expect(property('og:image')).toBe('https://preview.example.test/og-image.png');expect(property('og:image:secure_url')).toBe(property('og:image'));
  expect(property('og:image:width')).toBe('1200');expect(property('og:image:height')).toBe('630');expect(property('og:image:type')).toBe('image/png');expect(property('og:image:alt')).toContain('紹介画像');
  expect(name('twitter:card')).toBe('summary_large_image');expect(name('twitter:image')).toBe(property('og:image'));expect(name('twitter:image:alt')).toBe(property('og:image:alt'));
  expect($('link[rel="canonical"]').attr('href')).toBe(property('og:url'));expect($('head meta[property="og:image"]')).toHaveLength(1);
  expect($('meta[name="theme-color"]').attr('content')).toBe('#0b1013');expect($('script[type="module"]').attr('src')).toBe('/src/main.tsx');expect($('link[rel="manifest"]').attr('href')).toBe('/manifest.webmanifest');
 });

 it('replaces prior values without stale deployment URLs or duplicate metadata',()=>{
  const prior=transformSocialHtml(html,'https://previous.example.test');const output=transformSocialHtml(prior,'https://current.example.test/');const $=load(output);
  expect(output).not.toContain('previous.example.test');expect($('meta[property="og:image"]')).toHaveLength(1);expect($('meta[name="description"]')).toHaveLength(1);expect($('link[rel="canonical"]')).toHaveLength(1);
  expect(transformSocialHtml(output,'https://current.example.test')).toBe(output);
 });

 it('normalizes harmless origin differences and allows an explicit local preview',()=>{
  expect(normalizeSocialOrigin(' https://EXAMPLE.test:443/ ')).toBe('https://example.test');
  expect(normalizeSocialOrigin('http://localhost:5173')).toBe('http://localhost:5173');expect(normalizeSocialOrigin('http://127.0.0.1:4173/')).toBe('http://127.0.0.1:4173');expect(normalizeSocialOrigin('http://[::1]:4173')).toBe('http://[::1]:4173');
  expect(load(transformSocialHtml(html,'http://localhost:5173'))('meta[property="og:image"]').attr('content')).toBe('http://localhost:5173/og-image.png');
 });

 it.each([
  undefined,null,'','   ','example.test','//example.test','/somewhere','http://public.example.test','javascript:alert(1)','data:text/html,hello','file:///C:/hello','https:example.test','https:///example.test','https://example.test/child/..',
  'https://user:password@example.test','https://user@example.test','https://example.test/subpath','https://example.test/?token=private','https://example.test/#section','https://example.test?','https://example.test#',
  'https://example.test\n.evil.test','https://example.test/"/><script>alert(1)</script>','https://example.test/\u0000','https://example.test\\@evil.test','https://example.test/\'','https://example.test/`','https://example.test/space here',
 ])('rejects unsafe or non-origin input: %s',(origin)=>{
  expect(()=>normalizeSocialOrigin(origin)).toThrow();expect(()=>transformSocialHtml(html,origin)).toThrow();
 });

 it('ships an actual 1200 × 630 PNG with no build-time image-generation dependency',()=>{
  const png=readFileSync(new URL('../public/og-image.png',import.meta.url));expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);expect(png.length).toBeLessThan(1_000_000);
 });
});

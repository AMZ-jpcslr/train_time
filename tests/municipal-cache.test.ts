import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, utimes, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
// @ts-expect-error native Node ESM importer
import { readMunicipalCache, archiveMunicipalCache } from '../scripts/import-municipal.mjs';

const url = 'https://example.invalid/municipal.csv';
const timestamp = '2026-10-22T02:45:18.310Z';
const bytes = Buffer.from('source timetable fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'train-time-municipal-'));
  const target = path.join(dir, 'kobe-w-east.csv');
  const evidencePath = path.join(dir, 'evidence.json');
  await writeFile(target, bytes);
  await writeFile(evidencePath, JSON.stringify([{ sourceUrl: url, sha256, retrievedAt: timestamp }]));
  return { dir, target, evidencePath };
}

describe('municipal cache provenance', () => {
  it('restores legacy timestamp only from URL and SHA-matched evidence, ignoring file mtime', async () => {
    const { target, evidencePath } = await fixture();
    await utimes(target, new Date('2030-01-01'), new Date('2030-01-01'));
    const cached = await readMunicipalCache(target, url, evidencePath);
    expect(cached.retrievedAt).toBe(timestamp);
    expect(JSON.parse(await readFile(`${target}.meta.json`, 'utf8'))).toEqual({ sourceUrl: url, sha256, retrievedAt: timestamp });
    await utimes(target, new Date('2040-01-01'), new Date('2040-01-01'));
    expect((await readMunicipalCache(target, url, evidencePath)).retrievedAt).toBe(timestamp);
  });
  it('requires refresh when legacy evidence is absent or mismatched', async () => {
    const { target, evidencePath } = await fixture();
    await writeFile(evidencePath, '[]');
    await expect(readMunicipalCache(target, url, evidencePath)).rejects.toThrow('--refresh');
    await writeFile(evidencePath, JSON.stringify([{ sourceUrl: url, sha256: 'wrong', retrievedAt: timestamp }]));
    await expect(readMunicipalCache(target, url, evidencePath)).rejects.toThrow('--refresh');
  });
  it('detects changed raw bytes and corrupt sidecar without falling back to mtime', async () => {
    const { target, evidencePath } = await fixture();
    await readMunicipalCache(target, url, evidencePath);
    await writeFile(target, 'changed');
    await expect(readMunicipalCache(target, url, evidencePath)).rejects.toThrow('--refresh');
    await writeFile(`${target}.meta.json`, '{');
    await expect(readMunicipalCache(target, url, evidencePath)).rejects.toThrow('--refresh');
  });
  it('archives raw bytes and provenance before replacement, preserving prior generations', async () => {
    const { dir, target, evidencePath } = await fixture();
    await readMunicipalCache(target, url, evidencePath);
    const first = await archiveMunicipalCache(dir);
    expect(await readFile(path.join(first, path.basename(target)))).toEqual(bytes);
    expect(JSON.parse(await readFile(path.join(first, path.basename(target) + '.meta.json'), 'utf8')).retrievedAt).toBe(timestamp);
    await writeFile(target, 'replacement');
    const second = await archiveMunicipalCache(dir);
    expect(first).not.toBe(second);
    expect(await readFile(path.join(first, path.basename(target)))).toEqual(bytes);
    expect(await readFile(path.join(second, path.basename(target)), 'utf8')).toBe('replacement');
  });
  it('does not treat unrelated files as source history or missing files as evidence', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'train-time-empty-'));
    await mkdir(path.join(dir, 'history'));
    await writeFile(path.join(dir, 'unrelated.txt'), 'keep');
    expect(await archiveMunicipalCache(dir)).toBeNull();
    expect(await readMunicipalCache(path.join(dir, 'missing.csv'), url, path.join(dir, 'missing.json'))).toBeNull();
  });
});

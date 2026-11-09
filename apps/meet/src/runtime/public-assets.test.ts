import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicAssets } from './public-assets';

const publicDir = path.resolve(__dirname, '../../public');

function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const url = `${prefix}/${name}`;
    return statSync(full).isDirectory() ? walk(full, url) : [url];
  });
}

describe('publicAssets', () => {
  it('lists exactly the files shipped from apps/meet/public', () => {
    const shipped = walk(publicDir)
      .filter((url) => !url.endsWith('/_headers'))
      .sort();
    expect([...publicAssets].sort()).toEqual(shipped);
  });

  it('serves every brand mark the meeting UI can request', () => {
    for (const asset of [
      '/media/branding/brand-mark-light.svg',
      '/media/branding/brand-mark-dark.svg',
      '/media/logos/mira-light.png',
      '/media/logos/mira-dark.png',
    ])
      expect(publicAssets.has(asset), asset).toBe(true);
  });
});

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrecacheManifest } from './create-precache-manifest';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe('createPrecacheManifest', () => {
  it('hashes and maps Next and public assets to request URLs', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'offline-manifest-'));
    directories.push(cwd);
    await mkdir(path.join(cwd, '.next/static/chunks'), { recursive: true });
    await mkdir(path.join(cwd, 'public/icons'), { recursive: true });
    await writeFile(path.join(cwd, '.next/static/chunks/app.js'), 'app');
    await writeFile(path.join(cwd, 'public/icons/icon.svg'), '<svg/>');

    const manifest = await createPrecacheManifest({
      additionalEntries: [{ revision: 'release-1', url: '/~offline' }],
      cwd,
      globPatterns: ['.next/static/**/*', 'public/**/*'],
    });

    expect(manifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          revision: expect.stringMatching(/^[a-f0-9]{64}$/),
          url: '/_next/static/chunks/app.js',
        }),
        expect.objectContaining({
          revision: expect.stringMatching(/^[a-f0-9]{64}$/),
          url: '/icons/icon.svg',
        }),
        { revision: 'release-1', url: '/~offline' },
      ])
    );
  });

  it('skips files larger than the configured limit', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'offline-manifest-'));
    directories.push(cwd);
    await mkdir(path.join(cwd, 'public'), { recursive: true });
    await writeFile(path.join(cwd, 'public/large.txt'), 'too large');

    const manifest = await createPrecacheManifest({
      cwd,
      globPatterns: ['public/**/*'],
      maximumFileSizeToCacheInBytes: 2,
    });

    expect(manifest).toEqual([]);
  });
});

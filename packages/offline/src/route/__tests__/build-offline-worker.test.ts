import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOfflineWorker } from '../build-offline-worker';
import { createPrebuiltOfflineRoute } from '../prebuilt';

let appDir: string;

beforeEach(() => {
  appDir = mkdtempSync(path.join(tmpdir(), 'offline-worker-'));
  mkdirSync(path.join(appDir, 'src/app'), { recursive: true });
  mkdirSync(path.join(appDir, '.next/static/chunks'), { recursive: true });
  mkdirSync(path.join(appDir, 'public'), { recursive: true });
  writeFileSync(
    path.join(appDir, 'src/app/sw.ts'),
    'declare const self: { __TUTURUUU_PRECACHE_MANIFEST: unknown };\n' +
      'console.log(JSON.stringify(self.__TUTURUUU_PRECACHE_MANIFEST));\n'
  );
  writeFileSync(path.join(appDir, '.next/static/chunks/app.js'), 'app();');
  writeFileSync(path.join(appDir, 'public/logo.svg'), '<svg/>');
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(appDir, { force: true, recursive: true });
});

describe('buildOfflineWorker', () => {
  it('bundles the worker with the precache manifest and offline fallback', async () => {
    const files = await buildOfflineWorker(
      {
        offlineFallbackUrl: '/~offline',
        publicPrecachePatterns: false,
        revision: 'build-revision',
        swSrc: 'src/app/sw.ts',
      },
      appDir
    );

    expect(files.map((file) => file.path).sort()).toEqual([
      'sw.js',
      'sw.js.map',
    ]);
    const worker = files.find((file) => file.path === 'sw.js')?.contents;
    expect(worker).toContain('/~offline');
    expect(worker).toContain('build-revision');
    expect(worker).toContain('/_next/static/chunks/app.js');
    expect(worker).not.toContain('logo.svg');
    expect(worker).toContain('sourceMappingURL=sw.js.map');
  });

  it('serves the prebuilt files with the route headers', async () => {
    const files = await buildOfflineWorker(
      { publicPrecachePatterns: false, revision: 'build-revision' },
      appDir
    );
    const route = createPrebuiltOfflineRoute(files);

    expect(await route.generateStaticParams()).toEqual(
      expect.arrayContaining([{ path: 'sw.js' }, { path: 'sw.js.map' }])
    );
    const response = await route.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/javascript; charset=UTF-8'
    );
    expect(response.headers.get('Service-Worker-Allowed')).toBe('/');
    expect(await response.text()).toContain('/~offline');

    const map = await route.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js.map' }),
    });
    expect(map.headers.get('Content-Type')).toBe(
      'application/json; charset=UTF-8'
    );

    const missing = await route.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: '../sw.js' }),
    });
    expect(missing.status).toBe(404);
  });
});

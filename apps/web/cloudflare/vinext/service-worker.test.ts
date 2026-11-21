import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEB_OFFLINE_WORKER_CONFIG } from '../../src/lib/offline-worker-config';
import {
  DEFAULT_APP_DIR,
  DISPOSABLE_MARKER,
  DISPOSABLE_MARKER_CONTENT,
} from '../opennext/prune';
import { buildGatewayRouteTable } from './gateway-routes';
import { loadVinextFamilies } from './prune';
import {
  applyPrebuiltOfflineWorker,
  familyServesOfflineWorker,
  OFFLINE_FILES_MODULE,
  OFFLINE_ROUTE_ENTRY,
  PREBUILT_ROUTE_SOURCE,
} from './service-worker';

const enabled = loadVinextFamilies().config.families.filter(
  (family) => family.enabled
);
const offlineDir = path.join(
  DEFAULT_APP_DIR,
  '../../packages/offline/src/route'
);

describe('vinext service worker', () => {
  it('serves /serwist/* from exactly one family, with a prebuilt worker', () => {
    const owners = enabled
      .filter((family) => familyServesOfflineWorker(family.id))
      .map((family) => family.id);
    expect(owners).toEqual(['web-rest']);
    const routes = buildGatewayRouteTable().routes.filter((route) =>
      route.pattern.startsWith('/serwist/')
    );
    expect(routes).toEqual([
      { family: 'web-rest', localized: false, pattern: '/serwist/[path]' },
    ]);
  });

  it('keeps the Next.js route on createOfflineRoute with the shared config', () => {
    const route = readFileSync(
      path.join(DEFAULT_APP_DIR, 'src/app', OFFLINE_ROUTE_ENTRY),
      'utf8'
    );
    expect(route).toContain("from '@tuturuuu/offline/route'");
    expect(route).toMatch(
      /createOfflineRoute\(\s*WEB_OFFLINE_WORKER_CONFIG\s*\)/u
    );
    expect(WEB_OFFLINE_WORKER_CONFIG).toEqual({
      swSrc: 'src/app/sw.ts',
      offlineFallbackUrl: '/~offline',
      disableInDev: true,
      publicPrecachePatterns: false,
    });
  });

  it('serves the prebuilt route without a compiler or Node API', () => {
    expect(PREBUILT_ROUTE_SOURCE).toContain(
      "from '@tuturuuu/offline/route/prebuilt'"
    );
    for (const file of ['prebuilt.ts', 'serve-offline-worker.ts']) {
      const source = readFileSync(path.join(offlineDir, file), 'utf8');
      expect(source, file).not.toMatch(/from 'node:|esbuild|create-offline/u);
    }
  });

  it('runs before vp build and stamps the build commit', () => {
    const script = readFileSync(
      path.join(DEFAULT_APP_DIR, 'cloudflare/vinext/build-family.sh'),
      'utf8'
    );
    const prune = script.indexOf(
      'cloudflare/vinext/prune.ts "$family" --apply'
    );
    const worker = script.indexOf(
      'cloudflare/vinext/service-worker.ts "$family" --apply'
    );
    const build = script.indexOf('vite-plus/bin/vp build');
    expect(prune).toBeGreaterThan(-1);
    expect(worker).toBeGreaterThan(prune);
    expect(build).toBeGreaterThan(worker);
    expect(script).toContain(
      'PLATFORM_DEPLOYMENT_STAMP="$(git -C "$repo_dir" rev-parse HEAD | cut -c1-12)"'
    );
  });

  it('binds the deployment stamp into the Worker when it is set', async () => {
    const workerEnv = async (stamp: string) => {
      vi.resetModules();
      vi.stubEnv('WEB_VINEXT_FAMILY', 'web-rest');
      vi.stubEnv('PLATFORM_DEPLOYMENT_STAMP', stamp);
      const { default: config } = await import('../../cloudflare.config');
      vi.unstubAllEnvs();
      return (config as { worker: { env: Record<string, unknown> } }).worker
        .env;
    };
    expect((await workerEnv('0123456789ab')).PLATFORM_DEPLOYMENT_STAMP).toEqual(
      expect.objectContaining({ type: 'text', value: '0123456789ab' })
    );
    expect((await workerEnv('')).PLATFORM_DEPLOYMENT_STAMP).toBeFalsy();
  });
});

describe('applyPrebuiltOfflineWorker', () => {
  let appDir: string;
  const files = [
    { path: 'sw.js', contents: 'self.manifest=[{"url":"/~offline"}];' },
    { path: 'sw.js.map', contents: '{"version":3}' },
  ];
  const build = vi.fn(async () => files);

  beforeEach(() => {
    build.mockClear();
    appDir = mkdtempSync(path.join(tmpdir(), 'vinext-sw-'));
    for (const config of [
      'cloudflare/vinext/families.json',
      'cloudflare/opennext/families.json',
    ]) {
      mkdirSync(path.dirname(path.join(appDir, config)), { recursive: true });
      copyFileSync(
        path.join(DEFAULT_APP_DIR, config),
        path.join(appDir, config)
      );
    }
    mkdirSync(path.join(appDir, 'src/app/serwist/[path]'), { recursive: true });
    mkdirSync(path.join(appDir, 'src/app/api/health'), { recursive: true });
    writeFileSync(
      path.join(appDir, 'src/app', OFFLINE_ROUTE_ENTRY),
      'compiled at request time'
    );
    writeFileSync(path.join(appDir, 'src/app/api/health/route.ts'), '');
    writeFileSync(
      path.join(appDir, DISPOSABLE_MARKER),
      DISPOSABLE_MARKER_CONTENT
    );
  });

  afterEach(() => {
    rmSync(appDir, { force: true, recursive: true });
  });

  it('writes the prebuilt route and files for the owning family', async () => {
    expect(await applyPrebuiltOfflineWorker('web-rest', appDir, build)).toEqual(
      ['sw.js', 'sw.js.map']
    );
    expect(build).toHaveBeenCalledWith(
      {
        swSrc: 'src/app/sw.ts',
        offlineFallbackUrl: '/~offline',
        publicPrecachePatterns: false,
      },
      appDir
    );
    const appSrc = path.join(appDir, 'src/app');
    expect(readFileSync(path.join(appSrc, OFFLINE_ROUTE_ENTRY), 'utf8')).toBe(
      PREBUILT_ROUTE_SOURCE
    );
    const generated = readFileSync(
      path.join(appSrc, OFFLINE_FILES_MODULE),
      'utf8'
    );
    expect(generated).toContain(JSON.stringify(files, null, 2));
  });

  it('leaves families without the route untouched', async () => {
    expect(await applyPrebuiltOfflineWorker('api-core', appDir, build)).toBe(
      null
    );
    expect(build).not.toHaveBeenCalled();
  });

  it('refuses outside a disposable checkout', async () => {
    rmSync(path.join(appDir, DISPOSABLE_MARKER));
    await expect(
      applyPrebuiltOfflineWorker('web-rest', appDir, build)
    ).rejects.toThrow(/disposable checkout/u);
  });
});

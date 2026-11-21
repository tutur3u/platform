import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { startNativeAbuseGuard } from '../../../scripts/ci/fixtures/native-abuse-guard.mjs';

import { inspectServerArtifact } from './server-artifact.mjs';

const require = createRequire(import.meta.url);
const host = 'infrastructure.tuturuuu.com';

test(
  'production Infrastructure preserves auth, assets, host isolation and the legacy redirect',
  {
    timeout: 120000,
    skip: process.env.INFRASTRUCTURE_ARTIFACT_PROFILE !== 'production',
  },
  async (t) => {
    assert.equal(process.env.CI, 'true');
    const app = resolve('.');
    t.diagnostic(
      JSON.stringify(await inspectServerArtifact(join(app, 'dist/server')))
    );
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(config.name, 'tuturuuu-infrastructure');
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.upload_source_maps, false);
    assert.equal(config.vars.NODE_ENV, 'production');
    assert.equal(config.vars.TUTURUUU_REQUIRE_SECRETS, '1');
    assert.equal(config.vars.NEXT_PUBLIC_APP_URL, `https://${host}`);
    assert.equal(config.vars.NEXT_PUBLIC_WEB_APP_URL, 'https://tuturuuu.com');
    assert.equal(config.vars.TUTURUUU_LEGACY_HOST_REDIRECT, '1');
    const scratch = await mkdtemp(join(tmpdir(), 'infra-production-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), { recursive: true });
    await writeFile(join(scratch, 'empty.env'), '');
    const egress = [];
    const registry = join(scratch, 'registry');
    const sdk = require('wrangler');
    const guardBindings = await startNativeAbuseGuard(t, sdk, registry);
    const worker = await sdk.unstable_startWorker({
      config: join(scratch, relative(app, configPath)),
      envFiles: [join(scratch, 'empty.env')],
      sendMetrics: false,
      bindings: {
        ...guardBindings,
        ...Object.fromEntries(
          Object.entries({
            NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
              'sb_publishable_synthetic_only',
            SUPABASE_SECRET_KEY: 'synthetic-server-key',
            TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
          }).map(([name, value]) => [name, { type: 'secret_text', value }])
        ),
      },
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        origin: { secure: true },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: (req) => {
          egress.push(req.url);
          return new Response('Denied', { status: 599 });
        },
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const get = async (path, hostname = host) => {
      const res = await worker.fetch(`https://${hostname}${path}`, {
        redirect: 'manual',
      });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      };
    };
    for (const path of [
      '/',
      '/00000000-0000-4000-8000-000000000001',
      '/__native-smoke-missing__',
    ]) {
      const response = await get(path);
      t.diagnostic(
        JSON.stringify({
          path,
          status: response.status,
          headers: response.headers,
        })
      );
      // The legacy host only moves visitors to the apex mount.
      assert.equal(response.status, 301);
      assert.equal(
        response.headers.location,
        `https://tuturuuu.com/admin${path === '/' ? '' : path}`
      );
      assert.equal(
        response.headers['strict-transport-security'],
        'max-age=63072000'
      );
    }
    const mountedRoot = await get('/admin?filter=recent', 'tuturuuu.com');
    assert.equal(mountedRoot.status, 307);
    const mountedLogin = new URL(mountedRoot.headers.location);
    assert.equal(mountedLogin.origin, 'https://tuturuuu.com');
    assert.equal(mountedLogin.pathname, '/admin/login');
    assert.equal(mountedLogin.searchParams.get('next'), '/?filter=recent');
    const outsideMount = await get('/admin-team', 'tuturuuu.com');
    assert.equal(outsideMount.status, 404);
    const mountLogin = await get(
      '/admin/login?next=%2Finternal',
      'tuturuuu.com'
    );
    assert.equal(mountLogin.status, 307);
    // The central login answers with a same-origin relative Location.
    const centralLogin = new URL(
      mountLogin.headers.location,
      'https://tuturuuu.com/admin/login'
    );
    assert.equal(centralLogin.origin, 'https://tuturuuu.com');
    const callback = new URL(centralLogin.searchParams.get('returnUrl'));
    assert.equal(centralLogin.pathname, '/login');
    assert.equal(callback.origin, 'https://tuturuuu.com');
    assert.equal(callback.pathname, '/admin/verify-token');
    assert.equal(callback.searchParams.get('nextUrl'), '/internal');

    const asset = (await readdir(join(app, 'dist/client/assets'))).find(
      (name) => name.endsWith('.js')
    );
    assert.ok(asset);
    const mountedAsset = await get(`/admin/assets/${asset}`, 'tuturuuu.com');
    t.diagnostic(
      JSON.stringify({
        path: `/admin/assets/${asset}`,
        status: mountedAsset.status,
        headers: mountedAsset.headers,
      })
    );
    assert.equal(mountedAsset.status, 200);
    assert.deepEqual(
      mountedAsset.body,
      await readFile(join(app, 'dist/client/assets', asset))
    );
    const legacyAsset = await get(`/assets/${asset}?v=1`);
    assert.equal(legacyAsset.status, 301);
    assert.equal(
      legacyAsset.headers.location,
      `https://tuturuuu.com/admin/assets/${asset}?v=1`
    );
    // Machine traffic keeps answering on the legacy host.
    const legacyBuildInfo = await get('/api/build-info');
    assert.notEqual(legacyBuildInfo.status, 301);
    const legacyApi = await get(
      '/api/v1/mobile-deployment/bundle?platform=ios'
    );
    assert.ok(![301, 308].includes(legacyApi.status));
    const refused = await get(
      '/__native-smoke-missing__',
      'unknown-host.invalid'
    );
    t.diagnostic(
      JSON.stringify({
        host: 'unknown-host.invalid',
        status: refused.status,
        headers: refused.headers,
      })
    );
    assert.equal(refused.status, 404);
    assert.equal(refused.body.toString(), 'Not Found');
    assert.deepEqual(egress, []);
  }
);

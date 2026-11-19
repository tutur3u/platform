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

import { inspectServerArtifact } from './server-artifact.mjs';

const require = createRequire(import.meta.url);
const host = 'infrastructure.tuturuuu.com';

test(
  'production Infrastructure preserves auth, assets and host isolation',
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
    const scratch = await mkdtemp(join(tmpdir(), 'infra-production-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), { recursive: true });
    await writeFile(join(scratch, 'empty.env'), '');
    const egress = [];
    const worker = await require('wrangler').unstable_startWorker({
      config: join(scratch, relative(app, configPath)),
      envFiles: [join(scratch, 'empty.env')],
      sendMetrics: false,
      bindings: Object.fromEntries(
        Object.entries({
          NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
          SUPABASE_SECRET_KEY: 'synthetic-server-key',
          TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
        }).map(([name, value]) => [name, { type: 'secret_text', value }])
      ),
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry: join(scratch, 'registry'),
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
      assert.equal(response.status, 307);
      const target = new URL(response.headers.location, `https://${host}`);
      assert.equal(target.origin, `https://${host}`);
      assert.equal(target.pathname, '/login');
      assert.equal(target.searchParams.get('next'), path);
      assert.equal(
        response.headers['strict-transport-security'],
        'max-age=63072000'
      );
    }
    const asset = (await readdir(join(app, 'dist/client/assets'))).find(
      (name) => name.endsWith('.js')
    );
    assert.ok(asset);
    const response = await get(`/assets/${asset}`);
    t.diagnostic(
      JSON.stringify({
        path: `/assets/${asset}`,
        status: response.status,
        headers: response.headers,
      })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body,
      await readFile(join(app, 'dist/client/assets', asset))
    );
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

import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { assertRenderedAssets } from '../../../scripts/start-bridge-codemod/html-asset-acceptance.mjs';
import { deploymentProfile } from './deployment-profile.ts';

const profile = deploymentProfile(process.env.VITE_EXTERNAL_NATIVE_PROFILE);
const require = createRequire(import.meta.url);
test(
  'anonymous root and closed public ingress on the emitted Worker',
  { timeout: 120000 },
  async (t) => {
    assert.equal(process.env.CI, 'true', 'Run in owning CI after build');
    const { configPath, config } = readNativeRuntimeConfig(resolve('.'));
    assert.equal(config.name, profile.name);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    const scratch = await mkdtemp(join(tmpdir(), 'external-anonymous-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const envFile = join(scratch, 'empty.env');
    await writeFile(envFile, '', { mode: 0o600 });
    const registry = join(scratch, 'registry');
    await mkdir(registry);
    const values = {
      NODE_ENV: 'development',
      NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
      SUPABASE_SECRET_KEY: 'synthetic-server-key',
      TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
      INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
    };
    const worker = await require('wrangler').unstable_startWorker({
      config: configPath,
      envFiles: [envFile],
      sendMetrics: false,
      bindings: Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          { type: 'plain_text', value },
        ])
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
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: () =>
          new Response('{"error":"synthetic denial"}', {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const origin = await worker.url;
    const get = (host, path = '/') =>
      new Promise((resolveResponse, reject) => {
        request(
          {
            hostname: origin.hostname,
            port: origin.port,
            path,
            headers: { host },
          },
          (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () =>
              resolveResponse({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
          }
        )
          .on('error', reject)
          .end();
      });
    const canonical = 'external.tuturuuu.com';
    const apex = 'tuturuuu.com';
    assert.equal((await get('unknown.invalid')).status, 404);
    assert.equal((await get(apex, '/externality')).status, 404);

    const variants = [{ host: canonical, prefix: '' }];
    if (profile.mountHosts.includes(apex)) {
      variants.push({ host: apex, prefix: '/external' });
      assert.equal((await get(apex, '/api/build-info')).status, 404);
    } else {
      assert.equal((await get(apex, '/external?source=smoke')).status, 404);
    }

    for (const { host, prefix } of variants) {
      const page = await get(host, `${prefix || '/'}?source=smoke`);
      assert.equal(page.status, 200, host);
      assert.match(page.headers['content-type'] ?? '', /text\/html/u);
      assert.match(page.headers['cache-control'] ?? '', /\bno-store\b/u);
      assert.equal((await get(host, `${prefix}/robots.txt`)).status, 200);
      assert.equal(
        (await get(host, `${prefix}/api/storage/probe`)).status,
        403
      );

      const identity = await get(host, `${prefix}/api/build-info`);
      assert.equal(identity.status, 200, host);
      const build = JSON.parse(identity.body);
      assert.equal(build.appName, 'external', host);
      assert.match(process.env.CI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/u);
      assert.equal(build.commitHash, process.env.CI_SOURCE_SHA, host);
    }

    await t.test('every rendered resource loads from its page origin', (t) =>
      assertRenderedAssets(
        t,
        require,
        (path, host) => get(host, path),
        variants.map(({ host, prefix }) => ({
          host,
          path: prefix || '/',
          base: prefix,
        }))
      )
    );
  }
);

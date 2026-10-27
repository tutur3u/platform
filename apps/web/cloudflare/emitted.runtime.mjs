import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const base = 'https://web.staging.tutur3u.com';
const secret = 'disposable-emitted-worker-proof-secret';
const upstream = 'https://web-next-fixture.vercel.app';
const ref = 'fxefojytwimjiqxseqag';

const description =
  'emitted Web candidate on workerd with outbound fixtures only';
test(description, { timeout: 30000 }, async (t) => {
  const { config, configPath } = readNativeRuntimeConfig(root);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers, {});
  assert.equal(config.routes, undefined);
  assert.equal(config.vars.WEB_START_CANDIDATE, 'off');
  const entry = resolve(dirname(configPath), config.main);
  assert.match(await readFile(entry, 'utf8'), /Web candidate disabled/u);
  const modules = [
    entry,
    ...(await readdir(dirname(configPath), { recursive: true }))
      .filter((file) => /\.m?js$/u.test(file))
      .map((file) => resolve(dirname(configPath), file))
      .filter((file) => file !== entry),
  ].map((path) => ({ type: 'ESModule', path }));
  const egress = [];
  let attest = true;
  function instance(bindings) {
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        name: 'web-candidate',
        modules,
        modulesRoot: dirname(configPath),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings,
        outboundService: async (request) => {
          egress.push(request.url);
          assert.equal(
            new URL(request.url).origin,
            upstream,
            'Unexpected egress'
          );
          assert.match(
            request.headers.get('x-tuturuuu-origin-auth'),
            /^hmac-v1;/u
          );
          assert.equal(request.headers.get('cookie'), 'sb-auth=fixture');
          const headers = new Headers({
            'content-type': 'text/event-stream',
            'service-worker-allowed': '/',
            'retry-after': '5',
          });
          if (attest) headers.set('x-tuturuuu-staging-supabase-ref', ref);
          headers.append(
            'set-cookie',
            'sb-auth.0=one; Domain=.staging.tutur3u.com; Path=/; Secure; HttpOnly'
          );
          headers.append(
            'set-cookie',
            'sb-auth.1=two; Domain=.staging.tutur3u.com; Path=/; Secure; HttpOnly'
          );
          return new Response(`Next fixture:${await request.text()}`, {
            status: 429,
            headers,
          });
        },
      })
    );
    t.after(() => worker.dispose());
    return worker;
  }
  const disabled = instance(config.vars);
  const enabled = instance({
    ...config.vars,
    WEB_START_CANDIDATE: 'staging',
    NEXT_FALLBACK_ORIGIN: upstream,
    TRUSTED_PROXY_ORIGIN_SECRET: secret,
  });
  const headers = {
    'cf-connecting-ip': '203.0.113.10',
    cookie: 'sb-auth=fixture',
  };
  await t.test(
    'default-off emitted artifact rejects pages, assets, APIs and the Start probe',
    async () => {
      for (const path of [
        '/',
        '/assets/index.js',
        '/api/a',
        '/__web1',
        '/serwist/sw.js',
      ]) {
        const response = await disabled.dispatchFetch(`${base}${path}`, {
          headers,
        });
        assert.equal(response.status, 503);
        assert.equal(
          response.headers.get('strict-transport-security'),
          'max-age=31536000'
        );
      }
      assert.deepEqual(egress, []);
    }
  );
  await t.test('the actual Start server route handles its probe', async () => {
    const response = await enabled.dispatchFetch(`${base}/__web1`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'web',
      status: 'candidate',
      pages: 'Next-fallback',
    });
    assert.deepEqual(egress, []);
  });
  await t.test(
    'Next fallback preserves body, error, cookie and service-worker boundaries',
    async () => {
      const response = await enabled.dispatchFetch(
        `${base}/api/a?x=1&x=2&raw=%2f`,
        { method: 'POST', body: 'write-once', headers }
      );
      assert.equal(response.status, 429);
      assert.equal(await response.text(), 'Next fixture:write-once');
      assert.equal(response.headers.getSetCookie().length, 2);
      assert.equal(response.headers.get('retry-after'), '5');
      assert.equal(egress.at(-1), `${upstream}/api/a?x=1&x=2&raw=%2f`);
      const sw = await enabled.dispatchFetch(`${base}/serwist/sw.js?v=exact`, {
        headers,
      });
      assert.equal(sw.headers.get('service-worker-allowed'), '/');
      assert.equal(egress.at(-1), `${upstream}/serwist/sw.js?v=exact`);
    }
  );
  await t.test(
    'wrong project and canonical hosts fail closed in the emitted Worker',
    async () => {
      attest = false;
      const response = await enabled.dispatchFetch(`${base}/login`, {
        headers,
      });
      assert.equal(response.status, 502);
      assert.equal(response.headers.has('set-cookie'), false);
      const calls = egress.length;
      assert.equal(
        (await enabled.dispatchFetch('https://tuturuuu.com/login', { headers }))
          .status,
        503
      );
      assert.equal(egress.length, calls);
    }
  );
});

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
const base = 'https://contacts.staging.tutur3u.com';
const secret = 'disposable-emitted-worker-proof-secret';
const upstream = 'https://tuturuuu-next-fixture.vercel.app';
const ref = 'fxefojytwimjiqxseqag';

const description =
  'emitted Contacts candidate on workerd with outbound fixtures only';
test(description, { timeout: 30000 }, async (t) => {
  const { config, configPath } = readNativeRuntimeConfig(root);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers, {});
  assert.equal(config.routes, undefined);
  assert.equal(config.vars.CONTACTS_START_CANDIDATE, 'off');
  const entry = resolve(dirname(configPath), config.main);
  assert.match(await readFile(entry, 'utf8'), /Contacts candidate disabled/u);
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
        name: 'contacts-candidate',
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
    CONTACTS_START_CANDIDATE: 'staging',
    NEXT_FALLBACK_ORIGIN: upstream,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
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
        '/__contacts1',
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
    const response = await enabled.dispatchFetch(`${base}/__contacts1`, {
      headers,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'contacts',
      status: 'candidate',
      pages: 'Next-fallback',
    });
    const head = await enabled.dispatchFetch(`${base}/__contacts1`, {
      headers,
      method: 'HEAD',
    });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.deepEqual(egress, []);
  });
  await t.test(
    'Next fallback preserves body, error, cookie and Contacts API boundaries',
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
      for (const path of [
        '/en/ws/users/tutoring',
        '/vi/ws/users/feedbacks',
        '/api/v1/workspaces/ws/users/feedbacks',
        '/api/payments',
      ]) {
        const response = await enabled.dispatchFetch(`${base}${path}`, {
          headers,
        });
        assert.equal(response.status, 429);
        assert.equal(
          response.headers.get('x-tuturuuu-contacts-renderer'),
          'Next-fallback'
        );
        assert.equal(egress.at(-1), `${upstream}${path}`);
      }
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
  await t.test(
    'switching back to the off profile stops every subsequent downstream call',
    async () => {
      const calls = egress.length;
      for (const path of [
        '/ws/users/tutoring',
        '/__contacts1',
        '/api/payments',
      ]) {
        assert.equal(
          (await disabled.dispatchFetch(`${base}${path}`, { headers })).status,
          503
        );
      }
      assert.equal(egress.length, calls);
    }
  );
});

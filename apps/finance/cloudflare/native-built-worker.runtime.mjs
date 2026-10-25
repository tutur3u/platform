import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { withNativeBrowserFence } from '../../apps/cloudflare/native-browser-fence.mjs';
import {
  app,
  financeBrowserListener,
  financeRuntime,
  modes,
} from './native-runtime-fixture.mjs';

test('emitted Finance Worker: public shell, API ownership and action admission', {
  timeout: 180000,
}, async (t) => {
  const runtime = await financeRuntime(t);
  for (const { origin, base } of modes) {
    await t.test(
      `exact build and anonymous API admission at ${origin}${base}`,
      async () => {
        const anonymous = await runtime.fetch(
          `${origin}${base}/api/build-info`
        );
        assert.equal(anonymous.status, 401);
        await anonymous.text();
        const info = await runtime.fetch(`${origin}${base}/api/build-info`, {
          headers: { authorization: 'Bearer ttr_finance_runtime_fixture' },
        });
        assert.equal(info.status, 200);
        assert.equal(
          info.headers.get('x-robots-tag'),
          'noindex, nofollow, nosnippet'
        );
        const identity = await info.json();
        assert.equal(identity.appName, 'finance');
        assert.equal(identity.commitHash, runtime.source);
        for (const path of [
          '/api/workspaces/ws-1/wallets',
          '/api/v1/workspaces/ws-1/inventory/products',
        ]) {
          const response = await runtime.fetch(`${origin}${base}${path}`);
          assert.equal(response.status, 401, path);
          await response.text();
        }
        const method = await runtime.fetch(
          `${origin}${base}/_serverFn/unknown`,
          { method: 'DELETE' }
        );
        assert.equal(method.status, 405);
        assert.equal(method.headers.get('allow'), 'GET, POST');
        const contentType = await runtime.fetch(
          `${origin}${base}/_serverFn/unknown`,
          {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: 'fixture',
          }
        );
        assert.equal(contentType.status, 415);
      }
    );

    await t.test(`reserved Web routing at ${origin}${base}`, async () => {
      const response = await runtime.fetch(
        `${origin}${base}/api/workspaces/invitations?ref=a&ref=b`,
        {
          headers: { authorization: 'Bearer ttr_finance_runtime_fixture' },
        }
      );
      assert.equal(response.status, 202);
      assert.equal(await response.text(), 'reserved Web owner');
      const cookies = response.headers
        .getSetCookie()
        .filter((cookie) => cookie.startsWith('fixture_'));
      assert.equal(cookies.length, 2);
      assert.equal(
        runtime.central.at(-1),
        '/api/workspaces/invitations?ref=a&ref=b'
      );
    });

    await t.test(
      `English/Vietnamese auth and verification fallback at ${origin}${base}`,
      async () => {
        for (const locale of ['en', 'vi']) {
          const protectedPage = await runtime.fetch(
            `${origin}${base}/${locale}/ws-1?ref=a&ref=b`
          );
          assert.equal(protectedPage.status, 307);
          const login = new URL(protectedPage.headers.get('location'));
          assert.equal(login.origin, 'https://tuturuuu.com');
          assert.equal(login.pathname, '/login');
          const fallback = await runtime.fetch(
            `${origin}${base}/${locale}/verify-token`
          );
          assert.equal(fallback.status, 307);
          assert.equal(
            fallback.headers.get('location'),
            `${origin}${base}/`,
            'Missing-token fallback must retain its app mount'
          );
        }
      }
    );

    await t.test(`emitted static assets at ${origin}${base}`, async () => {
      const files = await readdir(join(app, 'dist/client/assets'));
      const javascript = files.find((file) => file.endsWith('.js'));
      const stylesheet = files.find((file) => file.endsWith('.css'));
      assert.ok(
        javascript && stylesheet,
        'Compiled client scripts/styles are required'
      );
      for (const path of [
        '/favicon.ico',
        '/robots.txt',
        `/assets/${javascript}`,
        `/assets/${stylesheet}`,
      ]) {
        const response = await runtime.fetch(`${origin}${base}${path}`);
        assert.equal(response.status, 200, path);
        assert.ok((await response.arrayBuffer()).byteLength > 0, path);
      }
    });
  }

  await t.test(
    'Chromium follows anonymous auth redirects with every hop fixture-fenced',
    async (browserTest) => {
      const require = createRequire(join(app, '../web/package.json'));
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      browserTest.after(() => browser.close());
      for (const mode of modes) {
        const origin = await financeBrowserListener(browserTest, runtime, mode);
        const result = await withNativeBrowserFence(
          browser,
          origin,
          ['https://tuturuuu.com'],
          async (page) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(`${origin}${mode.base}/en/ws-1?ref=a&ref=b`, {
              waitUntil: 'domcontentloaded',
            });
            await page.waitForURL(
              (url) =>
                url.origin === 'https://tuturuuu.com' &&
                url.pathname === '/login'
            );
            assert.equal(new URL(page.url()).pathname, '/login');
            assert.equal(await page.title(), 'Disposable destination fixture');
            assert.deepEqual(errors, []);
          },
          { maxRequests: 100 }
        );
        assert.ok(result.counts.fulfilled > 0);
        assert.equal(result.counts.blocked, 0);
        assert.equal(result.counts.excess, 0);
      }
    }
  );

  assert.deepEqual(
    runtime.unexpected,
    [],
    'Runtime attempted unadmitted egress'
  );
});

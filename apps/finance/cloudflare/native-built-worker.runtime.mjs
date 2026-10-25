import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { app, financeRuntime, modes } from './native-runtime-fixture.mjs';

test('emitted Finance Worker: public shell, API ownership and action admission', {
  timeout: 180000,
}, async (t) => {
  const runtime = await financeRuntime(t);
  for (const { origin, base } of modes) {
    await t.test(
      `exact build and anonymous API admission at ${origin}${base}`,
      async () => {
        const info = await runtime.fetch(`${origin}${base}/api/build-info`);
        assert.equal(info.status, 200);
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
          headers: { authorization: 'Bearer fixture' },
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
      `English/Vietnamese redirects and rendered token shell at ${origin}${base}`,
      async () => {
        for (const locale of ['en', 'vi']) {
          const protectedPage = await runtime.fetch(
            `${origin}${base}/${locale}/ws-1?ref=a&ref=b`
          );
          assert.equal(protectedPage.status, 307);
          const login = new URL(protectedPage.headers.get('location'));
          assert.equal(login.origin, 'https://tuturuuu.com');
          assert.ok(login.pathname.includes('login'));
          const shell = await runtime.fetch(
            `${origin}${base}/${locale}/verify-token`
          );
          assert.equal(shell.status, 200);
          const html = await shell.text();
          assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
          assert.equal(
            html.includes(runtime.secret),
            false,
            'Synthetic secret leaked to SSR'
          );
          const scripts = [
            ...html.matchAll(/src="([^" ]+\.js(?:\?[^" ]*)?)"/g),
          ].map((match) => match[1]);
          assert.ok(
            scripts.some((script) => script.startsWith(`${base}/assets/`)),
            'Native client entry missing'
          );
          for (const script of scripts) {
            const url = new URL(script, origin);
            assert.equal(url.origin, origin, 'Unexpected script origin');
            assert.ok(
              url.pathname.startsWith(`${base}/assets/`),
              `Unexpected script path: ${url.pathname}`
            );
            const asset = await runtime.fetch(url.href);
            assert.equal(asset.status, 200);
            await asset.arrayBuffer();
          }
        }
      }
    );
  }

  await t.test(
    'Chromium hydrates the token shell and reaches the guarded login in both URL modes',
    async (browserTest) => {
      const require = createRequire(join(app, '../web/package.json'));
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      browserTest.after(() => browser.close());
      for (const { origin, base } of modes) {
        const page = await browser.newPage();
        const failures = [];
        const errors = [];
        const scripts = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('requestfailed', (request) => failures.push(request.url()));
        await page.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (
            url.origin === origin &&
            (base === '' || url.pathname.startsWith(`${base}/`))
          ) {
            if (request.resourceType() === 'script') scripts.push(url.pathname);
            const response = await runtime.fetch(url.href, {
              method: request.method(),
              headers: request.headers(),
              ...(request.postDataBuffer()
                ? { body: request.postDataBuffer() }
                : {}),
            });
            const headers = Object.fromEntries(response.headers);
            const cookies = response.headers.getSetCookie();
            if (cookies.length) headers['set-cookie'] = cookies.join('\n');
            return route.fulfill({
              status: response.status,
              headers,
              body: Buffer.from(await response.arrayBuffer()),
            });
          }
          if (
            url.origin === 'https://tuturuuu.com' &&
            url.pathname.includes('login')
          ) {
            return route.fulfill({
              contentType: 'text/html',
              body: '<title>Fixture Login</title>',
            });
          }
          failures.push(url.href);
          await route.abort();
        });
        await page.goto(`${origin}${base}/en/verify-token`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForURL(
          (url) =>
            url.origin === 'https://tuturuuu.com' &&
            url.pathname.includes('login')
        );
        assert.equal(await page.title(), 'Fixture Login');
        assert.ok(scripts.length > 0, 'Compiled client did not hydrate');
        assert.deepEqual(errors, []);
        assert.deepEqual(failures, []);
        await page.close();
      }
    }
  );
  assert.deepEqual(
    runtime.unexpected,
    [],
    'Runtime attempted unadmitted egress'
  );
});

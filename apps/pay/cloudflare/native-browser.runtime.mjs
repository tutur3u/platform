import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { withNativeBrowserFence } from '../../apps/cloudflare/native-browser-fence.mjs';
import {
  app,
  modes,
  payBrowserListener,
  payRuntime,
} from './native-runtime-fixture.mjs';

function secure(response) {
  assert.equal(
    response.headers.get('x-robots-tag'),
    'noindex, nofollow, nosnippet'
  );
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    response.headers.get('referrer-policy'),
    'strict-origin-when-cross-origin'
  );
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('vary') ?? '', /Cookie/i);
  assert.match(
    response.headers.get('content-security-policy') ?? '',
    /frame-ancestors 'none'/
  );
}

test('Pay staging: identity, denial, sandbox isolation and anonymous browser redirects', {
  timeout: 180000,
}, async (t) => {
  for (const mode of modes) {
    await t.test(mode.origin, async (context) => {
      const runtime = await payRuntime(context, { payOrigin: mode.origin });
      await context.test(
        'public identity and negative API controls',
        async () => {
          const info = await runtime.fetch(`${mode.origin}/api/build-info`);
          assert.equal(info.status, 200);
          secure(info);
          const identity = await info.json();
          assert.equal(identity.appName, 'pay');
          assert.equal(identity.commitHash, runtime.source);
          const head = await runtime.fetch(`${mode.origin}/api/build-info`, {
            method: 'HEAD',
          });
          assert.equal(head.status, 200);
          assert.equal(await head.text(), '');
          for (const [path, method] of [
            ['/api/build-info', 'POST'],
            ['/api/build-info/extra', 'GET'],
            ['/api/build-information', 'GET'],
            ['/api/payment/seats', 'GET'],
            ['/api/v1/workspaces/fixture/billing', 'GET'],
          ]) {
            const denied = await runtime.fetch(`${mode.origin}${path}`, {
              method,
            });
            assert.equal(denied.status, 401, `${method} ${path}`);
            secure(denied);
            await denied.text();
          }
        }
      );
      if (mode.origin === 'https://pay-staging.tuturuuu.com') {
        await context.test(
          'staging login returns only to staging Pay',
          async () => {
            const response = await runtime.fetch(
              `${mode.origin}/login?next=/dashboard`
            );
            assert.equal(response.status, 307);
            const login = new URL(response.headers.get('location'));
            assert.equal(login.origin, 'https://staging.tuturuuu.com');
            assert.equal(login.pathname, '/login');
            const returned = new URL(login.searchParams.get('returnUrl'));
            assert.equal(returned.origin, mode.origin);
            assert.equal(returned.pathname, '/verify-token');
            assert.equal(returned.searchParams.get('nextUrl'), '/dashboard');
            await response.text();
          }
        );
      }
      await context.test(
        'machine endpoints reject absent cron authority and invalid webhook signatures',
        async () => {
          const cron = await runtime.fetch(
            `${mode.origin}/api/cron/payment/products`
          );
          assert.equal(cron.status, 401);
          await cron.text();
          const webhook = await runtime.fetch(
            `${mode.origin}/api/payment/webhooks`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'webhook-id': 'disposable-invalid-signature',
                'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
                'webhook-signature': 'v1,invalid',
              },
              body: '{}',
            }
          );
          assert.equal(webhook.status, 403);
          secure(webhook);
          await webhook.text();
        }
      );
      await context.test(
        'raw Host rejects apex and unlisted hosts',
        async () => {
          for (const host of modes) {
            const info = await runtime.rawFetch(
              `${host.origin}/api/build-info`
            );
            assert.equal(info.status, 200);
            await info.text();
          }
          for (const origin of [
            'https://tuturuuu.com/pay',
            'https://unknown.example.test',
          ]) {
            const denied = await runtime.rawFetch(`${origin}/api/build-info`);
            assert.equal(denied.status, 404);
            await denied.text();
          }
        }
      );
      await context.test(
        'Chromium reaches staging Web through bilingual anonymous Pay redirects',
        async (browserTest) => {
          const require = createRequire(join(app, '../web/package.json'));
          const { chromium } = require('playwright');
          const browser = await chromium.launch({ headless: true });
          browserTest.after(() => browser.close());
          const origin = await payBrowserListener(browserTest, runtime, mode);
          for (const locale of ['en', 'vi']) {
            const fenced = await withNativeBrowserFence(
              browser,
              origin,
              ['https://staging.tuturuuu.com'],
              async (page) => {
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                await page.goto(`${origin}/${locale}/dashboard`, {
                  waitUntil: 'domcontentloaded',
                });
                await page.waitForURL(
                  (url) =>
                    url.origin === 'https://staging.tuturuuu.com' &&
                    url.pathname === '/login'
                );
                assert.equal(
                  await page.title(),
                  'Disposable destination fixture'
                );
                assert.deepEqual(errors, []);
              },
              { maxRequests: 100 }
            );
            assert.ok(fenced.counts.fulfilled > 0);
            assert.equal(fenced.counts.blocked, 0);
            assert.equal(fenced.counts.excess, 0);
          }
        }
      );
      assert.deepEqual(
        runtime.unexpected,
        [],
        'No database or provider request may leave the sandbox fixture'
      );
    });
  }
});

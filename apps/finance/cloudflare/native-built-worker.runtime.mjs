import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import {
  runtimeExpectationProblems,
  runtimeOutcomeFailure,
} from '../../../scripts/start-bridge-codemod/runtime-outcome.mjs';
import { withNativeBrowserFence } from '../../apps/cloudflare/native-browser-fence.mjs';
import {
  app,
  financeBrowserListener,
  financeRuntime,
  modes,
} from './native-runtime-fixture.mjs';
import {
  fixtureWorkspaceId,
  fixtureWorkspaceName,
  signedSsrFixtureResponse,
  syntheticSessionHeaders,
} from './signed-ssr-fixture.mjs';

const runtimeExpectations = JSON.parse(
  await readFile(join(app, 'start-bridge.routes.json'), 'utf8')
).runtime;
assert.deepEqual(runtimeExpectationProblems(runtimeExpectations), []);

async function qualifyMode(t, mode) {
  const { origin, base } = mode;
  const signedCalls = [];
  const runtime = await financeRuntime(t, {
    financeOrigin: origin,
    fixtureResponse: (request) =>
      signedSsrFixtureResponse(request, signedCalls, origin),
  });
  await t.test(
    `exact build and anonymous API admission at ${origin}${base}`,
    async () => {
      const info = await runtime.fetch(`${origin}${base}/api/build-info`);
      assert.equal(info.status, 200);
      const head = await runtime.fetch(`${origin}${base}/api/build-info`, {
        method: 'HEAD',
      });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      for (const [path, method] of [
        ['/api/build-info', 'POST'],
        ['/api/build-info/extra', 'GET'],
        ['/api/build-information', 'GET'],
      ]) {
        const denied = await runtime.fetch(`${origin}${base}${path}`, {
          method,
        });
        assert.equal(denied.status, 401);
        await denied.text();
      }
      assert.equal(
        info.headers.get('x-robots-tag'),
        'noindex, nofollow, nosnippet'
      );
      assert.equal(info.headers.get('x-frame-options'), 'DENY');
      assert.equal(info.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(
        info.headers.get('referrer-policy'),
        'strict-origin-when-cross-origin'
      );
      assert.match(
        info.headers.get('content-security-policy') ?? '',
        /frame-ancestors 'none'/
      );
      assert.equal(info.headers.get('cache-control'), 'private, no-store');
      assert.match(info.headers.get('vary') ?? '', /Cookie/i);
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
      const method = await runtime.fetch(`${origin}${base}/_serverFn/unknown`, {
        method: 'DELETE',
      });
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
        assert.equal(login.origin, 'https://staging.tuturuuu.com');
        assert.equal(login.pathname, '/login');
      }
      for (const path of [
        '/verify-token',
        '/en/verify-token',
        '/vi/verify-token',
      ]) {
        const fallback = await runtime.fetch(`${origin}${base}${path}`);
        assert.equal(fallback.status, 307);
        assert.equal(
          fallback.headers.get('location'),
          `${origin}${base || '/'}`,
          'Missing-token fallback must retain its app mount'
        );
      }
    }
  );

  await t.test(`wildcard Accept-Language at ${origin}${base}`, async () => {
    for (const [language, supported] of [
      ['*', 'en'],
      ['en-US,en;q=0.9,*;q=0.1', 'en'],
      ['vi,*;q=0.5', 'vi'],
    ]) {
      const control = await runtime.fetch(`${origin}${base}/`, {
        headers: { 'accept-language': supported },
      });
      assert.equal(
        runtimeOutcomeFailure({
          path: '/',
          expected: runtimeExpectations['/'],
          origin,
          status: control.status,
          location: control.headers.get('location'),
        }),
        null
      );
      const expectedLocation = control.headers.get('location');
      await control.text();
      const response = await runtime.fetch(`${origin}${base}/`, {
        headers: { 'accept-language': language },
      });
      assert.equal(
        response.status,
        control.status,
        `Wildcard header ${language} must preserve supported-locale behavior`
      );
      assert.equal(response.headers.get('location'), expectedLocation);
      await response.text();
    }
  });

  await t.test(`signed-in EN/VI root SSR at ${origin}${base}`, async () => {
    for (const locale of ['en', 'vi']) {
      const headers = {
        ...syntheticSessionHeaders(runtime.secret),
        'accept-language': locale,
      };
      let url = `${origin}/${locale}/${fixtureWorkspaceId}?no-redirect=1`;
      let response;
      for (let hop = 0; hop < 4; hop++) {
        response = await runtime.fetch(url, { headers });
        if (![307, 308].includes(response.status)) break;
        const next = new URL(response.headers.get('location'), url);
        assert.equal(next.origin, origin, 'Signed-in SSR must stay on Finance');
        for (const cookie of response.headers.getSetCookie()) {
          headers.cookie += `; ${cookie.split(';')[0]}`;
        }
        await response.text();
        url = next.href;
      }
      assert.equal(response.status, 200, `Signed-in ${locale} SSR`);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('vary') ?? '', /Cookie/i);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      const html = await response.text();
      assert.match(html, new RegExp(`<html[^>]+lang=["']${locale}["']`));
      assert.ok(
        html.includes(fixtureWorkspaceName),
        'Workspace shell must render'
      );
      assert.doesNotMatch(
        html,
        /<template[^>]*data-msg=/,
        'SSR must not hide a stream error'
      );
    }
    assert.ok(signedCalls.some((path) => path.startsWith('/auth/v1/')));
    assert.ok(signedCalls.includes('/rest/v1/workspaces'));
    assert.ok(
      signedCalls.includes(
        `/api/workspaces/${fixtureWorkspaceId}/finance/overview`
      )
    );
    assert.ok(signedCalls.includes('/api/v1/users/me/profile'));
    assert.ok(
      signedCalls.includes(`/api/workspaces/${fixtureWorkspaceId}/transactions`)
    );
    const rejected = await runtime.fetch(`${origin}/en/${fixtureWorkspaceId}`, {
      headers: syntheticSessionHeaders(`${runtime.secret}-invalid`),
    });
    assert.equal(rejected.status, 307, 'Invalid signatures must not reach SSR');
    assert.equal(new URL(rejected.headers.get('location')).pathname, '/login');
    await rejected.text();
  });

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

  await t.test(
    `Chromium follows anonymous auth redirects at ${origin} with every hop fixture-fenced`,
    async (browserTest) => {
      const require = createRequire(join(app, '../web/package.json'));
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      browserTest.after(() => browser.close());
      {
        const origin = await financeBrowserListener(browserTest, runtime, mode);
        const result = await withNativeBrowserFence(
          browser,
          origin,
          ['https://staging.tuturuuu.com'],
          async (page) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(`${origin}${mode.base}/en/ws-1?ref=a&ref=b`, {
              waitUntil: 'domcontentloaded',
            });
            await page.waitForURL(
              (url) =>
                url.origin === 'https://staging.tuturuuu.com' &&
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

  await t.test(
    'raw Host admits configured roots and rejects apex/unlisted hosts',
    async () => {
      for (const mode of modes) {
        const admitted = await runtime.rawFetch(
          `${mode.origin}/api/build-info`
        );
        assert.equal(admitted.status, 200);
        assert.equal((await admitted.json()).commitHash, runtime.source);
      }
      for (const origin of [
        'https://tuturuuu.com/finance',
        'https://unknown.example.test',
      ]) {
        const rejected = await runtime.rawFetch(`${origin}/api/build-info`);
        assert.equal(rejected.status, 404);
        assert.equal(rejected.headers.get('x-frame-options'), 'DENY');
        assert.equal(
          rejected.headers.get('x-robots-tag'),
          'noindex, nofollow, nosnippet'
        );
        await rejected.text();
      }
    }
  );

  assert.deepEqual(
    runtime.unexpected,
    [],
    'Runtime attempted unadmitted egress'
  );
}

test('emitted Finance Worker: auth redirects, API ownership and action admission', {
  timeout: 180000,
}, async (t) => {
  for (const mode of modes) {
    await t.test(mode.origin, (modeTest) => qualifyMode(modeTest, mode));
  }
});

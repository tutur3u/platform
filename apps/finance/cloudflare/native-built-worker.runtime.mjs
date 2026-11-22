import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import './native-signed-ssr-fixture.test.mjs';
import './production-publication.runtime.mjs';
import {
  runtimeExpectationProblems,
  runtimeOutcomeFailure,
} from '../../../scripts/start-bridge-codemod/runtime-outcome.mjs';
import { withNativeBrowserFence } from '../../apps/cloudflare/native-browser-fence.mjs';
import {
  app,
  financeBrowserListener,
  financeRuntime,
  foreignOrigins,
  modes,
  profile,
  profiles,
} from './native-runtime-fixture.mjs';
import {
  fixtureWorkspaceId,
  fixtureWorkspaceName,
  signedSsrFixtureResponse,
  syntheticMountedSessionHeaders,
  syntheticSessionHeaders,
} from './signed-ssr-fixture.mjs';

const webOrigin = profile.vars.NEXT_PUBLIC_WEB_APP_URL;
// The manifest records the default (staging) Web login; rebase absolute
// redirects onto the selected profile's Web origin.
const manifestWebOrigin = profiles.staging.vars.NEXT_PUBLIC_WEB_APP_URL;
const runtimeExpectations = Object.fromEntries(
  Object.entries(
    JSON.parse(await readFile(join(app, 'start-bridge.routes.json'), 'utf8'))
      .runtime
  ).map(([path, expected]) => {
    if (
      typeof expected.redirect !== 'string' ||
      expected.redirect.startsWith('/')
    )
      return [path, expected];
    assert.ok(expected.redirect.startsWith(`${manifestWebOrigin}/`));
    return [
      path,
      {
        ...expected,
        redirect: webOrigin + expected.redirect.slice(manifestWebOrigin.length),
      },
    ];
  })
);

test(
  'production Finance mounts a read-only shared session with app-scoped cookies and assets',
  { skip: profile.rootHost !== profiles.production.rootHost, timeout: 90_000 },
  async (t) => {
    const origin = 'https://tuturuuu.com';
    const base = '/finance';
    const signedCalls = [];
    let defaultWorkspaceUnavailable = false;
    const runtime = await financeRuntime(t, {
      financeOrigin: origin,
      fixtureResponse: (request) => {
        assert.doesNotMatch(
          JSON.stringify([...request.headers]),
          /fixture-central-provider-refresh|tuturuuu_web_app_session/u
        );
        if (
          request.method === 'GET' &&
          new URL(request.url).pathname === '/api/v1/users/me/default-workspace'
        ) {
          signedCalls.push('/api/v1/users/me/default-workspace');
          return defaultWorkspaceUnavailable
            ? new Response('Fixture upstream unavailable', { status: 502 })
            : Response.json({ id: fixtureWorkspaceId, personal: false });
        }
        return signedSsrFixtureResponse(request, signedCalls, origin, base, {
          verifiedTotp: true,
        });
      },
    });
    const path = `/en/${fixtureWorkspaceId}?ref=a&ref=b`;
    const anonymous = await runtime.fetch(`${origin}${base}${path}`);
    assert.equal(anonymous.status, 307);
    assert.match(anonymous.headers.get('cache-control') ?? '', /no-store/u);
    const login = new URL(anonymous.headers.get('location'));
    assert.equal(login.origin, origin);
    assert.equal(login.pathname, '/login');
    const callback = new URL(login.searchParams.get('returnUrl'));
    assert.equal(callback.origin, origin);
    assert.equal(callback.pathname, '/finance/verify-token');
    assert.equal(callback.searchParams.get('nextUrl'), path);
    await anonymous.text();

    const pendingMfa = await runtime.fetch(`${origin}${base}${path}`, {
      headers: syntheticMountedSessionHeaders(runtime.secret),
    });
    assert.equal(pendingMfa.status, 307);
    const mfaLogin = new URL(pendingMfa.headers.get('location'));
    assert.equal(mfaLogin.origin, origin);
    assert.equal(mfaLogin.pathname, '/login');
    assert.equal(mfaLogin.searchParams.get('mfa'), 'required');
    assert.equal(mfaLogin.searchParams.get('returnUrl'), callback.href);
    assert.deepEqual(pendingMfa.headers.getSetCookie(), []);
    await pendingMfa.text();

    const headers = syntheticMountedSessionHeaders(runtime.secret, 'aal2');
    const rootCallback = await runtime.fetch(
      `${origin}${base}/verify-token?nextUrl=%2F`,
      {
        headers,
      }
    );
    assert.equal(rootCallback.status, 307);
    const root = rootCallback.headers.get('location');
    assert.ok(root === `${origin}${base}` || root === `${origin}${base}/`);
    await rootCallback.text();
    const rootRedirect = await runtime.fetch(root, { headers });
    assert.equal(rootRedirect.status, 307);
    assert.equal(
      rootRedirect.headers.get('location'),
      `${origin}${base}/${fixtureWorkspaceId}`
    );
    await rootRedirect.text();
    defaultWorkspaceUnavailable = true;
    const rootFallback = await runtime.fetch(
      `${origin}${base}/vi?ref=a&ref=b`,
      { headers }
    );
    assert.equal(rootFallback.status, 307);
    assert.equal(
      rootFallback.headers.get('location'),
      `${origin}${base}/vi/personal?ref=a&ref=b`
    );
    await rootFallback.text();
    assert.equal(
      signedCalls.filter(
        (call) => call === '/api/v1/users/me/default-workspace'
      ).length,
      2
    );

    const verified = await runtime.fetch(callback.href, { headers });
    assert.equal(verified.status, 307);
    assert.equal(verified.headers.get('location'), `${origin}${base}${path}`);
    await verified.text();
    let signedUrl = `${origin}${base}${path}`;
    let page = await runtime.fetch(signedUrl, { headers });
    let localeCookieSeen = false;
    for (let hop = 0; hop < 4; hop++) {
      for (const cookie of page.headers.getSetCookie()) {
        assert.match(cookie, /^NEXT_LOCALE=(en|vi);/u);
        assert.match(cookie, /;\s*Path=\/finance(?:;|$)/iu);
        assert.doesNotMatch(cookie, /;\s*Domain=/iu);
        localeCookieSeen = true;
        headers.cookie = [
          ...headers.cookie
            .split('; ')
            .filter((part) => !part.startsWith('NEXT_LOCALE=')),
          cookie.split(';')[0],
        ].join('; ');
      }
      if (![307, 308].includes(page.status)) break;
      const next = new URL(page.headers.get('location'), signedUrl);
      assert.equal(next.origin, origin);
      assert.ok(next.pathname.startsWith(`${base}/`), next.pathname);
      await page.text();
      signedUrl = next.href;
      page = await runtime.fetch(signedUrl, { headers });
    }
    assert.equal(page.status, 200, `Signed-in SSR at ${signedUrl}`);
    assert.ok(
      localeCookieSeen,
      'A locale change must exercise the cookie scope'
    );
    assert.equal(page.headers.get('cache-control'), 'private, no-store');

    const html = await page.text();
    assert.ok(html.includes(fixtureWorkspaceName));
    assert.doesNotMatch(html, /<template[^>]*data-msg=/u);
    assert.doesNotMatch(
      html,
      /(?:href|src|content)=["']https:\/\/finance\.tuturuuu\.com(?=[/?"'])/iu
    );
    const assets = [
      ...html.matchAll(/(?:href|src)=["']((?:\/finance)?\/assets\/[^"']+)/gu),
    ].map(([, url]) => url);
    assert.ok(assets.some((asset) => asset.endsWith('.js')));
    assert.ok(assets.some((asset) => asset.endsWith('.css')));
    assert.ok(assets.every((asset) => asset.startsWith('/finance/assets/')));

    for (const route of [
      '/api/auth/refresh-app-session',
      '/api/auth/verify-app-token',
    ]) {
      const refused = await runtime.fetch(`${origin}${base}${route}`, {
        method: 'POST',
        headers,
      });
      assert.equal(refused.status, 409);
      assert.deepEqual(refused.headers.getSetCookie(), []);
      await refused.text();
    }
    assert.ok(signedCalls.includes('/auth/v1/user'));
    assert.deepEqual(runtime.unexpected, []);
  }
);
assert.deepEqual(runtimeExpectationProblems(runtimeExpectations), []);

async function qualifyMode(t, mode) {
  const { origin, base } = mode;
  const signedCalls = [];
  const webglRoot =
    '/api/v1/workspaces/fixture/external-projects/assets/fixture/webgl';
  const webglPaths = [webglRoot, `${webglRoot}/index.html`];
  const neighbouringPaths = [`${webglRoot}-extra`, `${webglRoot};params`];
  const upstreamPolicy =
    "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'";
  const webglCalls = [];
  const runtime = await financeRuntime(t, {
    financeOrigin: origin,
    fixtureResponse: (request) => {
      const url = new URL(request.url);
      if (
        url.origin === 'https://finance-fixture.invalid' &&
        [...webglPaths, ...neighbouringPaths].includes(url.pathname)
      ) {
        webglCalls.push(url.pathname);
        return new Response('upstream WebGL fixture', {
          headers: {
            'content-type': 'text/html',
            'content-security-policy': upstreamPolicy,
            'x-frame-options': 'SAMEORIGIN',
          },
        });
      }
      return signedSsrFixtureResponse(request, signedCalls, origin);
    },
  });
  await t.test(
    `WebGL sandbox pass-through and neighbouring framing denial at ${origin}`,
    async () => {
      for (const path of [...webglPaths, ...neighbouringPaths]) {
        const response = await runtime.fetch(`${origin}${path}`, {
          headers: { authorization: 'Bearer ttr_finance_runtime_fixture' },
        });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'upstream WebGL fixture');
        if (webglPaths.includes(path)) {
          assert.equal(
            response.headers.get('content-security-policy'),
            upstreamPolicy
          );
          assert.equal(response.headers.get('x-frame-options'), null);
        } else {
          assert.match(
            response.headers.get('content-security-policy') ?? '',
            /frame-ancestors 'none'/
          );
          assert.equal(response.headers.get('x-frame-options'), 'DENY');
        }
      }
      assert.deepEqual(webglCalls, [...webglPaths, ...neighbouringPaths]);
    }
  );
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
      assert.equal(
        info.headers.get('strict-transport-security'),
        'max-age=63072000'
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
        assert.equal(login.origin, webOrigin);
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
    assert.ok(signedCalls.includes('/rest/v1/workspace_secrets'));
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
          [webOrigin],
          async (page) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(`${origin}${mode.base}/en/ws-1?ref=a&ref=b`, {
              waitUntil: 'domcontentloaded',
            });
            await page.waitForURL(
              (url) => url.origin === webOrigin && url.pathname === '/login'
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
    'raw Host enforces the profile host and exact production apex mount',
    async () => {
      for (const mode of modes) {
        const admitted = await runtime.rawFetch(
          `${mode.origin}/api/build-info`
        );
        assert.equal(admitted.status, 200);
        assert.equal((await admitted.json()).commitHash, runtime.source);
      }
      const apex = 'https://tuturuuu.com/finance/api/build-info';
      const rejectedUrls = [
        ...foreignOrigins.map((origin) => `${origin}/api/build-info`),
        'https://tuturuuu.com/api/build-info',
        'https://tuturuuu.com/finance-other/api/build-info',
        'https://unknown.example.test/api/build-info',
      ];
      if (profile.rootHost === profiles.production.rootHost) {
        const admitted = await runtime.rawFetch(apex);
        assert.equal(admitted.status, 200);
        assert.deepEqual(admitted.headers.getSetCookie(), []);
        assert.equal((await admitted.json()).commitHash, runtime.source);
        const head = await runtime.rawFetch(apex, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
      } else {
        rejectedUrls.push(apex);
      }
      for (const url of rejectedUrls) {
        const rejected = await runtime.rawFetch(url);
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

test(
  'emitted Finance Worker: auth redirects, API ownership and action admission',
  {
    timeout: 180000,
  },
  async (t) => {
    for (const mode of modes) {
      await t.test(mode.origin, (modeTest) => qualifyMode(modeTest, mode));
    }
  }
);

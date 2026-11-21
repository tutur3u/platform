import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appsProductionMountHost,
  exerciseAppsProductionMount,
} from './apps-native-production-mount.mjs';
import {
  exerciseStorefrontHost,
  storefrontAssetFile,
  storefrontRuntimeHosts,
} from './storefront-native-runtime.mjs';
import { verify } from './wave1-native-artifact.mjs';
import { releaseRecipes } from './wave1-native-profile.mjs';
import { runInfrastructureProductionRuntime } from './infrastructure-production-runtime.mjs';

export function calendarProductionRuntimeTarget(profile) {
  assert.equal(
    profile.name,
    releaseRecipes.calendar.cf.productionWorker,
    'Calendar apex acceptance requires the sealed production Worker'
  );
  return {
    host: 'tuturuuu.com',
    basePath: '/calendar',
    functionProbes: [
      {
        path: '/_fn/path-acceptance',
        method: 'DELETE',
        headers: {},
        status: 405,
      },
      {
        path: '/_fn/path-acceptance',
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        status: 415,
      },
    ],
  };
}

async function runRuntimeAcceptance() {
  // CI-only: starts workerd from sealed prebundled bytes, never builds or publishes.
  assert.equal(process.env.CI, 'true');
  const [app, environment, sha] = process.argv.slice(2);
  const appRoot = resolve('apps', app);
  const { receipt } = verify(appRoot, app, environment, sha);
  if (app === 'infrastructure' && environment === 'production') {
    await runInfrastructureProductionRuntime(appRoot, sha);
    verify(appRoot, app, environment, sha);
    return;
  }
  assert.ok(
    !process.env.CLOUDFLARE_API_TOKEN,
    'No provider credential in runtime gate'
  );
  const scratch = await mkdtemp(join(tmpdir(), 'wave1-runtime-'));
  await cp(join(appRoot, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    errorOnExist: true,
  });
  await writeFile(join(scratch, 'empty.env'), '');
  const require = createRequire(resolve(appRoot, 'package.json'));
  const { unstable_startWorker } = require('wrangler');
  const egress = [];
  const accessCertReads = [];
  // Calendar and Mail staging verify Access JWTs themselves; serve fixture team keys only.
  const access =
    (app === 'calendar' || app === 'mail') && environment === 'staging'
      ? accessFixture()
      : null;
  // N8/N9: each Calendar and Mail artifact must 404 the other environment's host.
  // The production Finance artifact rejects the staging subdomain.
  const foreignHost =
    app === 'calendar' || app === 'mail'
      ? environment === 'production'
        ? `${app}.tutur3u.com`
        : `${app}.tuturuuu.com`
      : app === 'finance'
        ? 'finance.tutur3u.com'
        : null;
  let clean = false;
  try {
    const hosts = [receipt.profile.host];
    const calendarPathTarget =
      app === 'calendar' && environment === 'production'
        ? calendarProductionRuntimeTarget(receipt.profile)
        : null;
    const financePathTarget =
      app === 'finance' && environment === 'production'
        ? {
            host: new URL(releaseRecipes.finance.mountHosts[0]).hostname,
            basePath: '/finance',
          }
        : null;
    const pathTarget = calendarPathTarget ?? financePathTarget;
    if (pathTarget) hosts.unshift(pathTarget.host);
    const appsMountHost =
      app === 'apps' && environment === 'production'
        ? appsProductionMountHost(releaseRecipes.apps)
        : null;
    if (appsMountHost) hosts.push(appsMountHost);
    if (app === 'apps' && environment === 'staging')
      hosts.push('apps.tuturuuu.com');
    if (foreignHost) hosts.push(foreignHost);
    // Storefront serves its root host and redirects its aliases to it.
    if (app === 'storefront' && environment === 'production')
      hosts.splice(0, hosts.length, ...storefrontRuntimeHosts(receipt.profile));
    for (const host of hosts) {
      let worker;
      try {
        worker = await unstable_startWorker({
          config: join(scratch, 'dist/wave1/wrangler.json'),
          envFiles: [join(scratch, 'empty.env')],
          sendMetrics: false,
          bindings: Object.fromEntries(
            receipt.profile.secrets.map((name) => [
              name,
              {
                type: 'secret_text',
                value:
                  name === 'NEXT_PUBLIC_SUPABASE_URL'
                    ? 'https://wave1-runtime.supabase.invalid'
                    : (access?.bindings[name] ??
                      'wave1_disposable_fixture_only'),
              },
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
            registry: join(scratch, 'registry'),
            server: { hostname: '127.0.0.1', port: 0 },
            origin: { hostname: host, secure: true },
            inferOriginFromRoutes: false,
            routeRequestsByRoutes: false,
            auth: () => {
              throw new Error('Provider auth forbidden');
            },
            outboundService: async (request) => {
              if (access && request.url === access.certsUrl) {
                accessCertReads.push(request.method);
                return Response.json(access.jwks);
              }
              egress.push('denied');
              return new Response('Egress denied', { status: 599 });
            },
          },
        });
        await worker.ready;
        const basePath = host === pathTarget?.host ? pathTarget.basePath : '';
        const fetchWorker = (path, init = {}, jwt = access?.token()) =>
          worker.fetch(`https://${host}${basePath}${path}`, {
            ...init,
            headers: {
              ...(init.headers ?? {}),
              ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}),
            },
            redirect: 'manual',
          });
        if (host === foreignHost) {
          for (const path of ['/api/build-info', '/en/personal', '/']) {
            const refused = await fetchWorker(path);
            assert.equal(refused.status, 404, `${host}${path} must 404`);
            assert.deepEqual(refused.headers.getSetCookie(), []);
          }
          continue;
        }
        if (host === appsMountHost) {
          await exerciseAppsProductionMount(fetchWorker, (file) => {
            assert.ok(
              Object.hasOwn(receipt.files, file),
              'App asset is not sealed'
            );
            return readFile(join(scratch, 'dist', file));
          });
          console.log(
            'Accepted Apps production mount https://tuturuuu.com/apps'
          );
          continue;
        }
        if (app === 'storefront' && environment === 'production') {
          const assetFile = storefrontAssetFile(receipt);
          const observed = await exerciseStorefrontHost({
            host,
            fetchWorker,
            sha,
            environment,
            assetFile,
            assetBytes: await readFile(join(appRoot, 'dist/client', assetFile)),
          });
          for (const line of observed) console.log(`storefront ${line}`);
          continue;
        }
        if (access) {
          // N19: missing, foreign-key, wrong-AUD and expired tokens are denied.
          for (const jwt of [
            null,
            access.token({ key: access.otherKey }),
            access.token({ aud: 'wave1-other-aud' }),
            access.token({ exp: -60 }),
            'not.a.jwt',
          ]) {
            const denied = await fetchWorker('/api/build-info', {}, jwt);
            assert.equal(denied.status, 403, 'Access JWT must be verified');
            assert.deepEqual(denied.headers.getSetCookie(), []);
          }
        }
        if (basePath) {
          for (const path of [
            '/api/build-info',
            `${basePath}-other/api/build-info`,
          ]) {
            const refused = await worker.fetch(`https://${host}${path}`, {
              redirect: 'manual',
            });
            assert.equal(refused.status, 404, `${host}${path} must 404`);
            assert.deepEqual(refused.headers.getSetCookie(), []);
          }
          for (const probe of calendarPathTarget?.functionProbes ?? []) {
            const refused = await fetchWorker(probe.path, {
              method: probe.method,
              headers: probe.headers,
            });
            assert.equal(
              refused.status,
              probe.status,
              'Mounted function boundary must reject before suppliers'
            );
            assert.deepEqual(refused.headers.getSetCookie(), []);
            if (probe.method === 'DELETE')
              assert.equal(refused.headers.get('allow'), 'GET, POST');
          }
        }
        const identity = await fetchWorker('/api/build-info');
        if (
          app === 'apps' &&
          environment === 'staging' &&
          host === 'apps.tuturuuu.com'
        ) {
          assert.equal(
            identity.status,
            503,
            'Staging canonical fence must reject'
          );
          continue;
        }
        assert.equal(
          identity.status,
          200,
          'Native build identity must be reachable'
        );
        const info = await identity.json();
        assert.equal(info.appName, app);
        assert.equal(
          info.commitHash,
          sha,
          'Actual bundled source identity differs'
        );
        assert.equal(info.environment, environment);
        assert.match(identity.headers.get('cache-control'), /no-store/);
        if (host === financePathTarget?.host)
          assert.deepEqual(identity.headers.getSetCookie(), []);
        if (host === financePathTarget?.host) {
          for (const path of [
            '/api/auth/refresh-app-session',
            '/api/auth/verify-app-token',
          ]) {
            const refused = await fetchWorker(path, { method: 'POST' });
            assert.equal(refused.status, 409);
            assert.deepEqual(refused.headers.getSetCookie(), []);
            await refused.body?.cancel();
          }
        }
        const post = await fetchWorker('/api/build-info', { method: 'POST' });
        // Finance's proxy refuses every unregistered anonymous API request.
        assert.equal(
          post.status,
          app === 'finance' ? 401 : 405,
          'Identity route must not accept mutations'
        );
        const head = await fetchWorker('/api/build-info', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        // Actual static bytes must survive original and restored workerd execution.
        const file = Object.keys(receipt.files).find(
          (name) => name.startsWith('client/assets/') && name.endsWith('.js')
        );
        assert.ok(file, 'Native client asset missing');
        if (calendarPathTarget && host !== calendarPathTarget.host) {
          // Legacy Calendar browser GETs permanently move to the apex mount.
          const apex = `https://${calendarPathTarget.host}${calendarPathTarget.basePath}`;
          const asset = `/${file.slice('client/'.length)}`;
          for (const [path, location] of [
            [asset, `${apex}${asset}`],
            [
              '/en/00000000-0000-4000-8000-000000000001?view=week',
              `${apex}/en/00000000-0000-4000-8000-000000000001?view=week`,
            ],
            ['/?view=week', `${apex}?view=week`],
          ]) {
            const moved = await fetchWorker(path);
            assert.equal(moved.status, 301, `${host}${path} must move`);
            assert.equal(moved.headers.get('location'), location);
            assert.deepEqual(moved.headers.getSetCookie(), []);
          }
          const serviceWorker = await fetchWorker('/serwist/sw.js');
          assert.equal(serviceWorker.status, 200);
          assert.match(serviceWorker.headers.get('cache-control'), /no-store/);
          assert.match(await serviceWorker.text(), /registration\.unregister/);
          continue;
        }
        const response = await fetchWorker(`/${file.slice('client/'.length)}`);
        assert.equal(response.status, 200);
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          await readFile(join(appRoot, 'dist', file))
        );
        if (app === 'mail' || app === 'calendar' || app === 'finance') {
          const workspace = '/en/00000000-0000-4000-8000-000000000001';
          const page = await fetchWorker(workspace);
          assert.equal(
            page.status,
            307,
            'Anonymous native page must hand off to central login'
          );
          let target = new URL(page.headers.get('location'));
          assert.equal(
            target.hostname,
            environment === 'production' ? 'tuturuuu.com' : 'web.tutur3u.com'
          );
          if (host === financePathTarget?.host) {
            assert.equal(target.pathname, '/login');
            assert.match(page.headers.get('cache-control') ?? '', /no-store/u);
            assert.deepEqual(page.headers.getSetCookie(), []);
            const returnUrl = new URL(target.searchParams.get('returnUrl'));
            assert.equal(returnUrl.origin, 'https://tuturuuu.com');
            assert.equal(returnUrl.pathname, '/finance/verify-token');
            assert.equal(returnUrl.searchParams.get('nextUrl'), workspace);
          }
          if (
            calendarPathTarget &&
            basePath &&
            !target.pathname.includes('login')
          ) {
            assert.equal(
              target.href,
              `https://${host}${basePath}/00000000-0000-4000-8000-000000000001`,
              'Mounted locale canonicalization must retain the exact workspace path'
            );
            const canonicalPage = await fetchWorker(
              '/00000000-0000-4000-8000-000000000001'
            );
            assert.equal(
              canonicalPage.status,
              307,
              'Canonical anonymous native page must hand off to central login'
            );
            target = new URL(
              canonicalPage.headers.get('location'),
              `https://${host}`
            );
            assert.equal(target.hostname, 'tuturuuu.com');
            assert.equal(target.pathname, `${basePath}/login`);
            const login = await fetchWorker(`/login${target.search}`);
            assert.equal(
              login.status,
              307,
              'Mounted login must hand off to Web'
            );
            target = new URL(login.headers.get('location'), `https://${host}`);
            assert.equal(target.origin, 'https://tuturuuu.com');
            assert.equal(target.pathname, '/login');
            const returnUrl = new URL(target.searchParams.get('returnUrl'));
            assert.equal(returnUrl.origin, 'https://tuturuuu.com');
            assert.equal(returnUrl.pathname, '/calendar/verify-token');
            assert.equal(returnUrl.searchParams.get('nextUrl'), '/personal');
          }
          assert.ok(
            target.pathname.includes('login'),
            `Expected login redirect, got ${target.href}`
          );
        }
      } finally {
        if (worker) await worker.dispose();
      }
    }
    assert.deepEqual(
      egress,
      [],
      'Anonymous acceptance unexpectedly contacted a supplier'
    );
    if (access)
      assert.ok(accessCertReads.length > 0, 'Access keys were never verified');
    verify(appRoot, app, environment, sha);
    clean = true;
    console.log(
      `Accepted original/restored ${app} ${environment} artifact ${sha}`
    );
  } finally {
    // Failed evidence is retained for CI diagnostics; the job watchdog owns SDK hangs.
    if (clean) await rm(scratch, { recursive: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runRuntimeAcceptance();
}

function accessFixture() {
  const teamDomain = 'wave1-fixture.cloudflareaccess.com';
  const audience = 'wave1-fixture-aud';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const otherKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).privateKey;
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    certsUrl: `https://${teamDomain}/cdn-cgi/access/certs`,
    jwks: {
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'wave1',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    },
    otherKey,
    bindings: {
      CF_ACCESS_TEAM_DOMAIN: teamDomain,
      CF_ACCESS_AUD: audience,
    },
    token({ key = privateKey, aud = audience, exp = 300 } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const body = `${encode({ alg: 'RS256', kid: 'wave1', typ: 'JWT' })}.${encode(
        {
          iss: `https://${teamDomain}`,
          aud: [aud],
          iat: now - 5,
          exp: now + exp,
          email: 'wave1-fixture@tuturuuu.invalid',
        }
      )}`;
      return `${body}.${sign('sha256', Buffer.from(body), key).toString('base64url')}`;
    },
  };
}

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appsProductionMountHost,
  exerciseAppsProductionMount,
} from './apps-native-production-mount.mjs';
import {
  exerciseMailProductionMount,
  mailProductionMountHost,
} from './mail-native-production-mount.mjs';
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
    host: 'calendar.tuturuuu.com',
    apexHost: 'tuturuuu.com',
    basePath: '/calendar',
    mode: 'shadow',
    functionProbes: [
      {
        path: '/_fn/path-acceptance',
        method: 'DELETE',
        headers: { origin: 'https://tuturuuu.com' },
        status: 405,
      },
      {
        path: '/_fn/path-acceptance',
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          origin: 'https://tuturuuu.com',
        },
        status: 415,
      },
    ],
  };
}

/** A browser document navigation, which fetch() cannot express. */
function documentNavigation(url, host, path) {
  return new Promise((resolveNavigation, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method: 'GET',
        headers: {
          host,
          accept: 'text/html',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
        },
      },
      (response) => {
        response.on('error', reject);
        response.resume();
        resolveNavigation({
          status: response.statusCode,
          location: response.headers.location ?? null,
        });
      }
    );
    request.setTimeout(15_000, () =>
      request.destroy(new Error('Document navigation timed out'))
    );
    request.on('error', reject);
    request.end();
  });
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
  // The production Finance and Drive artifacts reject the staging subdomain.
  const foreignHost =
    app === 'calendar' || app === 'mail'
      ? environment === 'production'
        ? `${app}.tutur3u.com`
        : `${app}.tuturuuu.com`
      : app === 'finance' || app === 'drive'
        ? `${app}.tutur3u.com`
        : null;
  let clean = false;
  try {
    const hosts = [receipt.profile.host];
    const calendarShadow =
      app === 'calendar' && environment === 'production'
        ? calendarProductionRuntimeTarget(receipt.profile)
        : null;
    // Finance and Drive also answer on their `/<app>` mount of the apex.
    const pathTarget =
      (app === 'finance' || app === 'drive') && environment === 'production'
        ? {
            host: new URL(releaseRecipes[app].mountHosts[0]).hostname,
            basePath: `/${app}`,
          }
        : null;
    if (pathTarget) hosts.unshift(pathTarget.host);
    if (calendarShadow) hosts.unshift(calendarShadow.apexHost);
    const appsMountHost =
      app === 'apps' && environment === 'production'
        ? appsProductionMountHost(releaseRecipes.apps)
        : null;
    const mailMountHost =
      app === 'mail' && environment === 'production'
        ? mailProductionMountHost(releaseRecipes.mail)
        : null;
    if (mailMountHost) hosts.push(mailMountHost);
    if (appsMountHost) hosts.push(appsMountHost);
    if (app === 'apps' && environment === 'staging')
      hosts.push('apps.tuturuuu.com');
    if (foreignHost) hosts.push(foreignHost);
    // Storefront serves its root host and redirects its aliases to it.
    if (app === 'storefront' && environment === 'production')
      hosts.splice(0, hosts.length, ...storefrontRuntimeHosts(receipt.profile));
    const targets = hosts.map((host) => ({ host, calendarOn: false }));
    if (calendarShadow)
      targets.push({ host: calendarShadow.host, calendarOn: true });
    for (const { host, calendarOn } of targets) {
      let worker;
      try {
        worker = await unstable_startWorker({
          config: join(scratch, 'dist/wave1/wrangler.json'),
          envFiles: [join(scratch, 'empty.env')],
          sendMetrics: false,
          bindings: {
            ...Object.fromEntries(
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
            ...(calendarOn
              ? { TTR_ONE_ORIGIN_CALENDAR: { type: 'plain_text', value: 'on' } }
              : {}),
          },
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
        const basePath =
          calendarShadow && host === calendarShadow.apexHost
            ? calendarShadow.basePath
            : host === pathTarget?.host
              ? pathTarget.basePath
              : '';
        const fetchWorker = (path, init = {}, jwt = access?.token()) =>
          worker.fetch(`https://${host}${basePath}${path}`, {
            ...init,
            headers: {
              ...(init.headers ?? {}),
              ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}),
            },
            redirect: 'manual',
          });
        if (calendarOn) {
          const path = '/vi/personal?view=week&tag=1&tag=2';
          // fetch() always stamps Sec-Fetch-Mode: cors, so the document
          // navigation goes over raw HTTP to the local server.
          const navigation = await documentNavigation(
            await worker.url,
            host,
            path
          );
          assert.equal(navigation.status, 301);
          assert.equal(
            navigation.location,
            `https://tuturuuu.com/calendar${path}`
          );
          // Only document navigations move; a fetch stays on the subdomain.
          const subresource = await fetchWorker(path, {
            headers: { 'sec-fetch-mode': 'cors' },
          });
          assert.notEqual(subresource.status, 301);
          assert.ok(
            !subresource.headers
              .get('location')
              ?.startsWith('https://tuturuuu.com/calendar'),
            'A non-navigation fetch moved to the apex mount'
          );
          await subresource.body?.cancel();
          const completion = await fetchWorker('/vi/verify-token');
          assert.equal(completion.status, 200);
          const html = await completion.text();
          const module = /<script\b[^>]*src="(\/assets\/[^"]+\.js)"/u.exec(
            html
          )?.[1];
          assert.ok(
            module,
            'Legacy verifier hydration asset is absent in on mode'
          );
          const asset = await fetchWorker(module);
          assert.equal(asset.status, 200);
          assert.match(asset.headers.get('content-type') ?? '', /javascript/u);
          await asset.body?.cancel();
          continue;
        }
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
        if (host === mailMountHost) {
          await exerciseMailProductionMount({
            fetchWorker,
            sha,
            readAsset: (file) => {
              assert.ok(
                Object.hasOwn(receipt.files, file),
                'Mail asset is not sealed'
              );
              return readFile(join(scratch, 'dist', file));
            },
          });
          console.log(
            'Accepted Mail production mount https://tuturuuu.com/mail'
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
          const functionProbes =
            calendarShadow && host === calendarShadow.apexHost
              ? calendarShadow.functionProbes
              : [];
          for (const probe of functionProbes) {
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
        if (calendarShadow && host === calendarShadow.apexHost)
          assert.match(identity.headers.get('x-robots-tag') ?? '', /noindex/);
        if (host === pathTarget?.host)
          assert.deepEqual(identity.headers.getSetCookie(), []);
        if (host === pathTarget?.host) {
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
        // Finance's proxy refuses every unregistered anonymous API request;
        // Drive's refuses it or lets the read-only route answer 405.
        const mutationStatuses =
          app === 'finance' ? [401] : app === 'drive' ? [401, 405] : [405];
        assert.ok(
          mutationStatuses.includes(post.status),
          `Identity route must not accept mutations, got ${post.status}`
        );
        const head = await fetchWorker('/api/build-info', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        // Actual static bytes must survive original and restored workerd execution.
        const file = Object.keys(receipt.files).find(
          (name) => name.startsWith('client/assets/') && name.endsWith('.js')
        );
        assert.ok(file, 'Native client asset missing');
        if (calendarShadow && host === calendarShadow.host) {
          // Shadow keeps the registered subdomain serving. The 301 and the
          // unregister worker run only when TTR_ONE_ORIGIN_CALENDAR is on.
          const apex = `https://${calendarShadow.apexHost}${calendarShadow.basePath}`;
          for (const path of [
            `/${file.slice('client/'.length)}`,
            '/en/00000000-0000-4000-8000-000000000001?view=week',
            '/?view=week',
          ]) {
            const served = await fetchWorker(path);
            assert.notEqual(
              served.status,
              301,
              `${host}${path} must keep serving`
            );
            const location = served.headers.get('location');
            assert.ok(
              location == null || !location.startsWith(apex),
              `${host}${path} must not move to the apex mount`
            );
            await served.body?.cancel();
          }
          for (const path of [
            '/api/v1/calendar/auth/callback',
            '/api/v1/calendar/auth/microsoft/callback',
          ]) {
            const callback = await fetchWorker(path);
            // This Worker fixture is anonymous. The legacy API proxy
            // requires a session before dispatching a provider callback.
            assert.equal(callback.status, 401, `${path} must require sign-in`);
            assert.equal(callback.headers.get('location'), null);
            await callback.body?.cancel();
          }
          const serviceWorker = await fetchWorker('/serwist/sw.js');
          assert.equal(serviceWorker.status, 200);
          assert.doesNotMatch(
            await serviceWorker.text(),
            /registration\.unregister/
          );
        }
        const response = await fetchWorker(`/${file.slice('client/'.length)}`);
        assert.equal(response.status, 200);
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          await readFile(join(appRoot, 'dist', file))
        );
        if (
          app === 'mail' ||
          app === 'calendar' ||
          app === 'finance' ||
          app === 'drive'
        ) {
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
          if (host === pathTarget?.host) {
            assert.equal(target.pathname, '/login');
            assert.match(page.headers.get('cache-control') ?? '', /no-store/u);
            assert.deepEqual(page.headers.getSetCookie(), []);
            const returnUrl = new URL(target.searchParams.get('returnUrl'));
            assert.equal(returnUrl.origin, 'https://tuturuuu.com');
            assert.equal(returnUrl.pathname, `${basePath}/verify-token`);
            assert.equal(returnUrl.searchParams.get('nextUrl'), workspace);
          }
          if (calendarShadow && host === calendarShadow.apexHost) {
            // Shared mounted login: Web returns to the mount's verify-token
            // with the exact in-mount path, locale and query included.
            const expectWebLogin = (response, nextUrl) => {
              assert.equal(
                response.status,
                307,
                'Anonymous mounted page must hand off to Web login'
              );
              const login = new URL(
                response.headers.get('location'),
                `https://${host}`
              );
              assert.equal(login.origin, 'https://tuturuuu.com');
              assert.equal(login.pathname, '/login');
              const returnUrl = new URL(login.searchParams.get('returnUrl'));
              assert.equal(returnUrl.origin, 'https://tuturuuu.com');
              assert.equal(returnUrl.pathname, `${basePath}/verify-token`);
              assert.equal(returnUrl.searchParams.get('nextUrl'), nextUrl);
              for (const cookie of response.headers.getSetCookie())
                assert.doesNotMatch(
                  cookie,
                  /^(?:sb-|__Host-ttr_session)|(?:^|;)\s*Domain=/iu,
                  'Mounted login handoff wrote a shared session cookie'
                );
              return login;
            };
            target = expectWebLogin(page, workspace);
            const returnPath =
              '/00000000-0000-4000-8000-000000000001?view=week&q=a%2Bb';
            const canonicalPage = await fetchWorker(returnPath);
            expectWebLogin(canonicalPage, returnPath);
            await canonicalPage.body?.cancel();
            const dormant = await fetchWorker(
              '/api/v1/calendar/auth/microsoft/callback'
            );
            assert.equal(dormant.status, 409);
            assert.deepEqual(dormant.headers.getSetCookie(), []);
            await dormant.body?.cancel();
          }
          if (calendarShadow && host === calendarShadow.host) {
            const returnUrl = new URL(target.searchParams.get('returnUrl'));
            assert.equal(returnUrl.origin, `https://${calendarShadow.host}`);
            assert.equal(returnUrl.pathname, '/verify-token');
            assert.equal(returnUrl.searchParams.get('nextUrl'), workspace);
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

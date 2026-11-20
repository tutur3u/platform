import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { assertRenderedAssets } from '../../../scripts/start-bridge-codemod/html-asset-acceptance.mjs';
import { convertV4MiniflareOptions, Miniflare } from './emitted.runtime.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const rootHost = 'contacts.tuturuuu.com';
const apexHost = 'tuturuuu.com';
const profiles = [
  { host: rootHost, base: '' },
  { host: apexHost, base: '/contacts' },
];
const workspace = '00000000-0000-4000-8000-000000000001';
const fixtureOrigin = 'https://contacts-runtime.supabase.invalid';
const redisOrigin = 'https://contacts-rate-limit.invalid';
const actorId = '00000000-0000-4000-8000-000000000002';
const coordinationSecret = randomBytes(32).toString('hex');

function signedHeaders() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    typ: 'app_coordination',
    iss: 'tuturuuu',
    aud: 'tuturuuu-api',
    sub: actorId,
    email: null,
    origin_app: 'web',
    target_app: 'contacts',
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    scopes: ['internal-app:session'],
  })}`;
  const signature = createHmac('sha256', coordinationSecret)
    .update(unsigned)
    .digest('base64url');
  return { authorization: `Bearer ttr_app_${unsigned}.${signature}` };
}

test(
  'emitted Contacts production Worker on both hosts',
  { timeout: 120000 },
  async (t) => {
    const source = process.env.CI_SOURCE_SHA;
    assert.match(source ?? '', /^[a-f0-9]{40}$/u);
    const { config, configPath } = readNativeRuntimeConfig(app);
    assert.equal(config.name, 'tuturuuu-contacts');
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.upload_source_maps, false);
    assert.equal(config.no_bundle, true);
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.assets.not_found_handling, 'none');
    assert.equal(config.routes, undefined);

    const moduleRoot = dirname(configPath);
    const entry = resolve(moduleRoot, config.main);
    const assets = resolve(moduleRoot, config.assets.directory);
    const modules = [
      entry,
      ...(await readdir(moduleRoot, { recursive: true }))
        .filter((name) => /\.m?js$/u.test(name))
        .map((name) => resolve(moduleRoot, name))
        .filter((path) => path !== entry),
    ].map((path) => ({ type: 'ESModule', path }));
    const egress = [];
    const centralCalls = [];
    const billingPath = `/api/v1/workspaces/${workspace}/users/${actorId}/billing`;

    function start(bindings) {
      const worker = new Miniflare(
        convertV4MiniflareOptions({
          name: config.name,
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          modules,
          modulesRoot: moduleRoot,
          bindings: { ...config.vars, ...bindings },
          assets: {
            directory: assets,
            binding: config.assets.binding,
            routerConfig: { has_user_worker: true },
            run_worker_first: config.assets.run_worker_first,
            assetConfig: {
              not_found_handling: config.assets.not_found_handling,
            },
          },
          outboundService: (request) => {
            const { origin, pathname } = new URL(request.url);
            if (
              origin === fixtureOrigin &&
              pathname === `/auth/v1/admin/users/${actorId}` &&
              request.method === 'GET'
            ) {
              return Response.json({
                user: { id: actorId, app_metadata: {}, user_metadata: {} },
              });
            }
            if (origin === redisOrigin && request.method === 'POST') {
              return Response.json({ result: null });
            }
            if (
              origin === `https://${apexHost}` &&
              [billingPath, '/api/workspaces/invitations'].includes(pathname) &&
              request.method === 'GET' &&
              request.headers.has('authorization')
            ) {
              centralCalls.push(pathname);
              return Response.json({ source: 'central-fixture' });
            }
            egress.push({ origin, pathname });
            return new Response('Outbound denied by Contacts fixture', {
              status: 599,
            });
          },
        })
      );
      t.after(() => worker.dispose());
      return worker;
    }

    const unavailable = start({});
    const refusal = await unavailable.dispatchFetch(`https://${rootHost}/`);
    assert.equal(refusal.status, 503, await refusal.text());
    assert.match(refusal.headers.get('cache-control') ?? '', /no-store/u);
    assert.deepEqual(egress, []);

    const worker = start({
      NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      SUPABASE_SECRET_KEY: 'sb_secret_fixture',
      TUTURUUU_APP_COORDINATION_SECRET: coordinationSecret,
      UPSTASH_REDIS_REST_URL: redisOrigin,
      UPSTASH_REDIS_REST_TOKEN: 'disposable-rate-limit-token',
    });

    async function call(path, host, init) {
      const response = await worker.dispatchFetch(`https://${host}${path}`, {
        ...init,
        redirect: 'manual',
      });
      assert.equal(
        response.headers.get('strict-transport-security'),
        'max-age=63072000'
      );
      assert.equal(response.headers.get('x-tuturuuu-runtime'), 'native');
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      };
    }

    for (const { host, base } of profiles) {
      const path = `${base}/api/build-info`;
      assert.equal((await call(path, host)).status, 401);
      const build = await call(path, host, { headers: signedHeaders() });
      assert.equal(
        build.status,
        200,
        JSON.stringify({ host, body: build.body, egress })
      );
      const info = JSON.parse(build.body);
      assert.equal(info.appName, 'contacts', host);
      assert.equal(info.commitHash, source, host);

      const ambiguous = await call(
        `${base}//foreign-host/${workspace}/billing`,
        host,
        {
          headers: signedHeaders(),
        }
      );
      assert.equal(ambiguous.status, 400, ambiguous.body);
      assert.equal(ambiguous.headers.location, undefined);

      for (const path of [billingPath, '/api/workspaces/invitations']) {
        const shared = await call(`${base}${path}`, host, {
          headers: signedHeaders(),
        });
        assert.equal(shared.status, 200, shared.body);
        assert.deepEqual(JSON.parse(shared.body), {
          source: 'central-fixture',
        });
      }
      for (const path of [
        `/api/v1/workspaces/${workspace}/users/feedbacks`,
        `/api/v1/workspaces/${workspace}/users/reports`,
      ]) {
        const local = await call(`${base}${path}`, host, {
          method: 'OPTIONS',
          headers: signedHeaders(),
        });
        assert.equal(local.status, 204, local.body);
        assert.match(local.headers.allow ?? '', /\bGET\b/u);
      }

      const localized = await call(`${base}/vi/login?x=1&x=2`, host);
      assert.equal(localized.status, 307, host);
      const location = new URL(localized.headers.location, `https://${host}`);
      assert.equal(location.pathname, `${base}/login`);
      assert.equal(location.search, '?x=1&x=2');
      assert.match(
        localized.headers['set-cookie'] ?? '',
        /\bNEXT_LOCALE=vi\b/u
      );

      if (base) {
        const trailingSlash = await call(`${base}/`, host);
        assert.equal(trailingSlash.status, 307);
        assert.equal(
          new URL(trailingSlash.headers.location, `https://${host}`).pathname,
          base
        );
      }
      const home = await call(base || '/', host);
      assert.equal(home.status, 307, home.body);
      assert.equal(
        new URL(home.headers.location, `https://${host}`).pathname,
        `${base}/dashboard`
      );
      const login = await call(`${base}/login?next=/%3Fx%3D1%26x%3D2`, host);
      assert.equal(login.status, 307, login.body);
      const central = new URL(login.headers.location, `https://${host}`);
      assert.equal(
        central.href.startsWith('https://tuturuuu.com/login?'),
        true,
        central.href
      );
      const callback = new URL(central.searchParams.get('returnUrl'));
      assert.equal(callback.origin, `https://${host}`);
      assert.equal(callback.pathname, `${base}/verify-token`);
      assert.equal(
        callback.searchParams.get('nextUrl'),
        `${base || '/'}?x=1&x=2`
      );

      for (const path of [
        '/users/tutoring',
        '/users/reports',
        '/reports',
        '/billing',
      ]) {
        const response = await call(`${base}/${workspace}${path}`, host);
        assert.equal(response.status, 307, response.body);
        assert.match(response.headers['cache-control'] ?? '', /no-store/u);
        assert.doesNotMatch(
          response.headers['set-cookie'] ?? '',
          /tuturuuu_app_session|sb-.*-auth-token/u
        );
      }

      const asset = await call(`${base}/robots.txt`, host);
      assert.equal(asset.status, 200, host);
      assert.equal(
        asset.body,
        await readFile(join(app, 'public/robots.txt'), 'utf8')
      );
    }

    const mint = await call('/contacts/api/auth/verify-app-token', apexHost, {
      method: 'POST',
    });
    assert.equal(mint.status, 409);
    assert.equal(mint.headers['set-cookie'], undefined);

    for (const path of ['/', '/contacts-other', '/api/build-info']) {
      assert.equal((await call(path, apexHost)).status, 404, path);
    }
    assert.equal((await call('/contacts', 'unadmitted.invalid')).status, 404);

    await assertRenderedAssets(
      t,
      require,
      call,
      profiles.map(({ host, base }) => ({
        host,
        base,
        path: `${base}/verify-token/__native-asset-probe/missing`,
        status: 404,
      }))
    );

    assert.deepEqual(
      egress,
      [],
      'Anonymous requests never contact an upstream'
    );
  }
);

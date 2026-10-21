import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exerciseAppsSessions } from '../../../scripts/ci/apps-native-runtime.mjs';
import {
  launchAppsAcceptance,
  readAppsChildPlan,
} from '../../../scripts/ci/apps-native-runtime-launcher.mjs';
import { gatewayFunctionId } from './native-artifact-functions.mjs';
import { nativeRedirectCases } from './native-browser-navigation.mjs';
import {
  assertNoRuntimeResources,
  fixtureEgress,
  isAppsAssuranceRequest,
} from './native-runtime-fence.mjs';
import { runtimeDeadline } from './runtime-deadline.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const fixtures = JSON.parse(
  await readFile(
    new URL('./native-route-fixtures.json', import.meta.url),
    'utf8'
  )
);
function contained(root, path) {
  const value = relative(root, path);
  assert.ok(
    value && !value.startsWith('..') && !isAbsolute(value),
    'Artifact must remain inside its declared root'
  );
  return path;
}
function token(secret, userId, target = 'apps') {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      aud: 'tuturuuu-api',
      iss: 'tuturuuu',
      typ: 'app_coordination',
      sub: userId,
      email: 'fixture@example.test',
      target_app: target,
      origin_app: 'web',
      scopes: ['internal-app:session'],
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
    })
  ).toString('base64url');
  return `ttr_app_${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

test('actual native Worker implements both pages, every app launch and the API boundary', {
  timeout: 60000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Run only after the owning CI native build, never as a source-only unit test'
  );
  if (!process.env.NATIVE_FIXTURE_CASE)
    return launchAppsAcceptance(
      fileURLToPath(import.meta.url),
      'http',
      process.env.CI_SOURCE_SHA,
      process.env.APPS_ARTIFACT_RECEIPT
    );
  const { plan, prepared, receiptFile } = await readAppsChildPlan('http');
  const runtime = runtimeDeadline(t.signal, 54000);
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const { configPath, config } = plan;
  assert.equal(config.name, 'tuturuuu-apps-vite-staging');
  assert.equal(config.no_bundle, true);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assertNoRuntimeResources(config);
  await stat(
    contained(join(app, 'dist'), resolve(dirname(configPath), config.main))
  );
  const calls = [];
  const userId = randomUUID();
  const secret = randomBytes(32).toString('hex');
  const session = token(secret, userId);
  const fixtureKey = randomBytes(32).toString('hex');
  let assuranceState = 'allowed';
  const fixture = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({
      url: request.url,
      method: request.method,
      body: Buffer.concat(chunks).toString(),
      cookie: request.headers.cookie,
    });
    response.setHeader('Content-Type', 'application/json');
    if (request.url?.startsWith('/auth/v1/admin/')) {
      if (
        !isAppsAssuranceRequest(
          {
            url: `${fixtureOrigin}${request.url}`,
            method: request.method,
            headers: new Headers(request.headers),
            body: chunks.length ? Buffer.concat(chunks) : null,
          },
          fixtureOrigin,
          userId,
          fixtureKey
        )
      ) {
        response.statusCode = 599;
        response.end(JSON.stringify({ error: 'Fixture assurance denied' }));
        return;
      }
      if (assuranceState === 'unavailable') {
        response.statusCode = 503;
        response.end(
          JSON.stringify({ message: 'Fixture assurance unavailable' })
        );
        return;
      }
      response.end(
        JSON.stringify({
          id: userId,
          email: 'fixture@example.test',
          user_metadata: {},
          app_metadata: {
            tuturuuu_required_mfa: {
              required: assuranceState === 'required',
              verifiedAfter: 0,
            },
          },
          banned_until:
            assuranceState === 'banned' ? '2999-01-01T00:00:00.000Z' : null,
        })
      );
    } else if (request.url?.startsWith('/auth/v1/user')) {
      response.end(
        JSON.stringify({
          id: userId,
          email: 'fixture@example.test',
          user_metadata: {},
        })
      );
    } else if (request.url?.startsWith('/rest/v1/')) {
      response.end('[]');
    } else if (request.url === '/api/v1/users/me/profile') {
      response.end(
        JSON.stringify({
          id: userId,
          email: 'fixture@example.test',
          avatar_url: null,
          display_name: 'Fixture',
          full_name: 'Fixture',
          default_workspace_id: null,
          created_at: null,
          new_email: null,
        })
      );
    } else if (request.url === '/api/v1/workspaces/other?tag=1&tag=2') {
      response.statusCode = 403;
      response.setHeader('Set-Cookie', [
        'fixture_a=1; Path=/',
        'fixture_b=2; Path=/',
      ]);
      response.end(JSON.stringify({ message: 'tenant denied' }));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => fixture.close(resolve)));
  const fixtureAddress = fixture.address();
  assert.ok(fixtureAddress && typeof fixtureAddress === 'object');
  const fixtureOrigin = `http://127.0.0.1:${fixtureAddress.port}`;
  assert.equal(
    Object.hasOwn(config.vars, 'PLATFORM_BUILD_COMMIT_HASH'),
    false,
    'Compiled source identity must not be replaced by a runtime binding'
  );
  const fence = fixtureEgress(
    fixtureOrigin,
    userId,
    runtime.signal,
    undefined,
    'app',
    fixtureKey
  );
  const negativeFence = fixtureEgress(
    fixtureOrigin,
    userId,
    runtime.signal,
    undefined,
    'negative',
    fixtureKey
  );
  const bindings = {
    INTERNAL_WEB_API_ORIGIN: fixtureOrigin,
    NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
    SUPABASE_SECRET_KEY: fixtureKey,
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
  await exerciseAppsSessions(
    plan,
    prepared,
    { app: fence, negative: negativeFence },
    bindings,
    async (workers, completed) => {
      runtime.check();
      const origin = (await workers.app.url).origin;
      runtime.check();
      // The same compiled API handler must hit the runtime deny service.
      const negativeWorker = workers.negative;
      const denied = await negativeWorker.fetch(
        `${origin}/api/v1/users/me/profile`,
        {
          headers: { cookie: `tuturuuu_app_session=${session}` },
          signal: runtime.signal,
        }
      );
      assert.equal(denied.status, 599);
      assert.equal(await runtime.text(denied), 'Fixture egress denied');
      assert.deepEqual(negativeFence.unexpected, [
        {
          method: 'GET',
          url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
        },
      ]);
      assert.deepEqual(negativeFence.permitted, []);
      assert.equal(negativeFence.assurance.length, 1);
      completed('negative');
      const info = await runtime.json(
        await runtime.fetch(`${origin}/api/build-info`)
      );
      assert.equal(info.appName, 'apps');
      assert.equal(info.commitHash, source);
      assert.equal(
        (await runtime.fetch(`${origin}/api/build-info`, { method: 'POST' }))
          .status,
        405
      );
      assert.equal(
        (await runtime.fetch(`${origin}/api/build-info`, { method: 'HEAD' }))
          .status,
        200
      );
      completed('build');
      for (const locale of ['en', 'vi']) {
        const prefixed = await runtime.fetch(
          `${origin}/${locale}/meet/a%2Fb?tag=1&tag=2`,
          { redirect: 'manual' }
        );
        assert.equal(prefixed.status, 307);
        assert.equal(
          prefixed.headers.get('location'),
          `${origin}/meet/a%2Fb?tag=1&tag=2`
        );
        assert.match(
          prefixed.headers.get('set-cookie'),
          new RegExp(`NEXT_LOCALE=${locale}`)
        );
        for (const signed of [false, true]) {
          const response = await runtime.fetch(origin, {
            headers: {
              cookie: `NEXT_LOCALE=${locale}${signed ? `; tuturuuu_app_session=${session}` : ''}`,
            },
          });
          assert.equal(response.status, 200);
          const html = await runtime.text(response);
          assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
          for (const app of fixtures)
            assert.ok(
              html.includes(`href="/${app.slug}"`),
              `Missing native SSR app ${app.slug}`
            );
          assert.ok(
            !html.includes('fullAppPort') &&
              !html.includes('fixture-service-key') &&
              !html.includes(fixtureKey) &&
              !html.includes(secret)
          );
          const scripts = [...html.matchAll(/src="(\/assets\/[^" ]+\.js)"/g)];
          assert.ok(
            scripts.length > 0,
            'Native Start must emit real client scripts'
          );
          for (const [, script] of scripts)
            assert.equal(
              (await runtime.fetch(new URL(script, origin))).status,
              200
            );
          assert.match(response.headers.get('cache-control'), /no-store/);
        }
      }
      completed('localeSSR');
      for (const app of fixtures) {
        for (const query of nativeRedirectCases) {
          const response = await runtime.fetch(
            `${origin}/${app.slug}/a%2Fb${query.input}`,
            { redirect: 'manual' }
          );
          assert.equal(response.status, 307);
          assert.equal(
            response.headers.get('location'),
            `${app.origin}/a%2Fb${query.output}`
          );
        }
      }
      completed('redirects');
      const functionId = await gatewayFunctionId(prepared.roles.app.root);
      const rpc = `${origin}/_serverFn/${encodeURIComponent(functionId)}`;
      const rpcCounters = () => ({
        fixtureCalls: calls.length,
        app: {
          permitted: fence.permitted.length,
          assurance: fence.assurance.length,
          unexpected: fence.unexpected.length,
        },
        negative: {
          permitted: negativeFence.permitted.length,
          assurance: negativeFence.assurance.length,
          unexpected: negativeFence.unexpected.length,
        },
      });
      for (const requestOrigin of [
        null,
        'https://apps-foreign-origin.invalid',
      ]) {
        const before = rpcCounters();
        const denied = await runtime.fetch(rpc, {
          headers: {
            'x-tsr-serverfn': 'true',
            cookie: `NEXT_LOCALE=vi; tuturuuu_app_session=${session}`,
            ...(requestOrigin === null ? {} : { origin: requestOrigin }),
          },
        });
        await runtime.text(denied);
        assert.equal(denied.status, 403);
        assert.deepEqual(rpcCounters(), before);
      }
      const [signedRpc, anonymousRpc] = await Promise.all([
        runtime.fetch(rpc, {
          headers: {
            'x-tsr-serverfn': 'true',
            origin,
            cookie: `NEXT_LOCALE=vi; tuturuuu_app_session=${session}`,
          },
        }),
        runtime.fetch(rpc, {
          headers: {
            'x-tsr-serverfn': 'true',
            cookie: 'NEXT_LOCALE=en',
            origin,
          },
        }),
      ]);
      assert.equal(signedRpc.status, 200);
      assert.equal(anonymousRpc.status, 200);
      const signedPayload = await runtime.text(signedRpc);
      const anonymousPayload = await runtime.text(anonymousRpc);
      assert.ok(signedPayload.includes(userId) && signedPayload.includes('vi'));
      assert.ok(!anonymousPayload.includes(userId));
      assert.ok(
        !signedPayload.includes(secret) &&
          !signedPayload.includes(session) &&
          !signedPayload.includes('fixture-service-key') &&
          !signedPayload.includes(fixtureKey)
      );
      const wrongTarget = await runtime.fetch(rpc, {
        headers: {
          'x-tsr-serverfn': 'true',
          origin,
          cookie: `tuturuuu_app_session=${token(secret, userId, 'mail')}`,
        },
      });
      assert.equal(wrongTarget.status, 200);
      assert.ok(
        !(await runtime.text(wrongTarget)).includes(userId),
        'Another app target cannot become an Apps actor'
      );
      completed('rpc');
      assert.equal((await runtime.fetch(`${origin}/%ZZ`)).status, 400);
      assert.equal(
        (await runtime.fetch(origin, { method: 'POST' })).status,
        405
      );
      const wrongMethod = await runtime.fetch(rpc, {
        method: 'POST',
        headers: { 'x-tsr-serverfn': 'true', origin },
      });
      assert.equal(wrongMethod.status, 405);
      assert.equal(
        (await runtime.fetch(`${origin}/missing-app-fixture`)).status,
        404
      );
      completed('methods');
      try {
        for (const [state, status, code, assurance] of [
          ['required', 403, 'MFA_REQUIRED', 'required'],
          ['banned', 401, 'UNAUTHENTICATED', null],
          ['unavailable', 503, 'AUTH_UNAVAILABLE', 'unavailable'],
        ]) {
          assuranceState = state;
          const reads = fence.assurance.length;
          const forwarded = fence.permitted.length;
          const blocked = await runtime.fetch(
            `${origin}/api/v1/workspaces/other?tag=1&tag=2`,
            {
              method: 'PATCH',
              headers: {
                cookie: `tuturuuu_app_session=${session}`,
                'content-type': 'application/json',
              },
              body: '{"title":"exact"}',
            }
          );
          assert.equal(blocked.status, status);
          assert.equal((await runtime.json(blocked)).code, code);
          assert.match(blocked.headers.get('cache-control'), /no-store/);
          assert.equal(
            blocked.headers.get('x-tuturuuu-auth-assurance'),
            assurance
          );
          assert.equal(blocked.headers.get('location'), null);
          assert.deepEqual(blocked.headers.getSetCookie(), []);
          assert.equal(fence.assurance.length, reads + 1);
          assert.equal(fence.permitted.length, forwarded);
          assert.equal(
            calls.filter(
              (call) => call.url === '/api/v1/workspaces/other?tag=1&tag=2'
            ).length,
            0
          );
        }
      } finally {
        assuranceState = 'allowed';
      }
      const api = await runtime.fetch(
        `${origin}/api/v1/workspaces/other?tag=1&tag=2`,
        {
          method: 'PATCH',
          headers: {
            cookie: `tuturuuu_app_session=${session}`,
            'content-type': 'application/json',
          },
          body: '{"title":"exact"}',
        }
      );
      assert.equal(api.status, 403);
      assert.equal(await runtime.text(api), '{"message":"tenant denied"}');
      assert.deepEqual(api.headers.getSetCookie(), [
        'fixture_a=1; Path=/',
        'fixture_b=2; Path=/',
      ]);
      const forwarded = calls.filter(
        (call) => call.url === '/api/v1/workspaces/other?tag=1&tag=2'
      );
      assert.equal(forwarded.length, 1);
      assert.equal(forwarded[0].method, 'PATCH');
      assert.equal(forwarded[0].body, '{"title":"exact"}');
      assert.equal(forwarded[0].cookie, `tuturuuu_app_session=${session}`);
      const invalidBearer = await runtime.fetch(
        `${origin}/api/v1/workspaces/other`,
        { headers: { authorization: 'Bearer ttr_app_invalid' } }
      );
      assert.equal(invalidBearer.status, 401);
      assert.equal(fence.assurance.length, 4);
      assert.equal(negativeFence.assurance.length, 1);
      assert.deepEqual(negativeFence.permitted, []);
      assert.deepEqual(
        fence.permitted.map(({ method, url }) => ({
          method,
          path: new URL(url).pathname + new URL(url).search,
        })),
        [
          ...Array.from({ length: 3 }, () => ({
            method: 'GET',
            path: '/api/v1/users/me/profile',
          })),
          { method: 'PATCH', path: '/api/v1/workspaces/other?tag=1&tag=2' },
        ]
      );
      completed('patch');
      assert.ok(
        fence.permitted.length > 0,
        'Actual Worker must reach disposable fixtures'
      );
      assert.deepEqual(
        fence.unexpected,
        [],
        'Actual HTTP/SSR/RPC suite must have zero unexpected egress'
      );
      completed('egress');
      // A real HTTP listener must preserve the original host, scheme and port.
      const listenerRedirect = await runtime.fetch(
        `${origin}/vi/meet/a%2Fb?tag=1&tag=2`,
        { redirect: 'manual' }
      );
      assert.equal(listenerRedirect.status, 307);
      assert.equal(
        listenerRedirect.headers.get('location'),
        `${origin}/meet/a%2Fb?tag=1&tag=2`
      );
      completed('listenerOrigin');
    },
    receiptFile,
    runtime.signal
  );
  assert.deepEqual(
    fence.unexpected,
    [],
    'No unexpected runtime egress during disposal'
  );
  assert.equal(fence.assurance.length, 4);
  assert.equal(negativeFence.assurance.length, 1);
  assert.deepEqual(negativeFence.permitted, []);
});

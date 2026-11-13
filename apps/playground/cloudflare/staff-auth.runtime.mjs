import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
async function stageArtifact() {
  const { configPath } = readNativeRuntimeConfig(app);
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'playground-native-'))
  );
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  return {
    scratch,
    envFile,
    registry,
    configPath: join(scratch, relative(app, configPath)),
  };
}

/**
 * Problems with a signed request for an unknown page; empty when it is the
 * shared Tuturuuu status page (`@tuturuuu/ui/custom/status-page`) served as a
 * 404 with no private page shell or staff identity in it.
 */
export function brandedNotFoundProblems({ status, body }, privateMarkers) {
  const problems = [];
  if (status !== 404) problems.push(`status ${status}`);
  if ((body.match(/<h1[\s>]/giu) ?? []).length !== 1) problems.push('one h1');
  if (!body.includes('data-status-page="not-found"'))
    problems.push('status page');
  if (!body.includes('data-href="tuturuuu-status-page"'))
    problems.push('status page styles');
  if (!body.includes('We couldn’t find that page'))
    problems.push('not-found heading');
  if (privateMarkers.some((marker) => body.includes(marker)))
    problems.push('private content');
  return problems;
}

test('the branded 404 contract rejects a bare page, a 200 and leaked data', () => {
  const branded =
    '<!DOCTYPE html><html lang="en"><head><style data-href="tuturuuu-status-page">.ttr-sp{}</style></head>' +
    '<body><div class="ttr-sp" data-status-page="not-found"><main>' +
    '<h1 class="ttr-sp__title">We couldn’t find that page</h1></main></div></body></html>';
  const privateMarkers = ['staff@tuturuuu.com', 'Loading...'];
  assert.deepEqual(
    brandedNotFoundProblems({ status: 404, body: branded }, privateMarkers),
    []
  );
  assert.deepEqual(
    brandedNotFoundProblems(
      {
        status: 404,
        body: '<html><body><main style="padding:2rem"><h1>404</h1></main></body></html>',
      },
      privateMarkers
    ),
    ['status page', 'status page styles', 'not-found heading']
  );
  assert.deepEqual(
    brandedNotFoundProblems({ status: 200, body: branded }, privateMarkers),
    ['status 200']
  );
  assert.deepEqual(
    brandedNotFoundProblems(
      {
        status: 404,
        body: branded.replace('</main>', '<p>staff@tuturuuu.com</p></main>'),
      },
      privateMarkers
    ),
    ['private content']
  );
  assert.deepEqual(
    brandedNotFoundProblems(
      { status: 404, body: branded.replace('</main>', '<h1>404</h1></main>') },
      privateMarkers
    ),
    ['one h1']
  );
});

// Finance's isolated signed-SSR pattern: sign with a fresh local key and answer
// Auth/membership reads in outboundService. No production credentials or egress.
test(
  'emitted Playground verifies staff before rendering private pages',
  {
    timeout: 120000,
  },
  async (t) => {
    assert.equal(process.env.CI, 'true');
    assert.match(process.env.CI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/u);
    const staged = await stageArtifact();
    let worker;
    t.after(async () => {
      try {
        await worker?.dispose();
      } finally {
        await rm(staged.scratch, { recursive: true, force: true });
      }
    });
    const secret = randomBytes(32).toString('hex');
    const userId = '46cb11ba-cf10-44db-9f66-d47a4fc9df14';
    const user = {
      id: userId,
      email: 'staff@tuturuuu.com',
      email_confirmed_at: '2026-10-01T00:00:00Z',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
      identities: [{ provider: 'email', identity_data: {} }],
    };
    const calls = [];
    const unexpected = [];
    const plain = (value) => ({ type: 'plain_text', value });
    worker = await require('wrangler').unstable_startWorker({
      config: staged.configPath,
      envFiles: [staged.envFile],
      sendMetrics: false,
      bindings: {
        INTERNAL_WEB_API_ORIGIN: plain('https://central.invalid'),
        NEXT_PUBLIC_SUPABASE_URL: plain(
          'https://playground-ci.supabase.invalid'
        ),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('fixture-public-key'),
        SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
        TUTURUUU_APP_COORDINATION_SECRET: {
          type: 'secret_text',
          value: secret,
        },
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
        registry: staged.registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: (request) => {
          const url = new URL(request.url);
          if (
            request.method === 'GET' &&
            url.href === 'https://central.invalid/api/v1/users/me/profile'
          ) {
            return Response.json({
              ...user,
              display_name: 'Synthetic Staff',
              default_workspace_id: '00000000-0000-0000-0000-000000000000',
              avatar_url: null,
              full_name: 'Synthetic Staff',
              new_email: null,
            });
          }
          if (
            request.method === 'GET' &&
            url.origin === 'https://playground-ci.supabase.invalid'
          ) {
            if (url.pathname === `/auth/v1/admin/users/${userId}`) {
              calls.push('auth');
              return Response.json({
                user,
              });
            }
            if (
              url.pathname === '/rest/v1/workspace_members' &&
              url.searchParams.get('ws_id') ===
                'eq.00000000-0000-0000-0000-000000000000' &&
              url.searchParams.get('user_id') === `eq.${userId}`
            ) {
              calls.push('membership');
              return Response.json({ type: 'MEMBER' });
            }
          }
          unexpected.push(`${request.method} ${request.url}`);
          return new Response('Unadmitted fixture egress', { status: 599 });
        },
      },
    });
    await worker.ready;
    const listener = new URL((await worker.url).origin);
    function token(target) {
      const now = Math.floor(Date.now() / 1000);
      const encode = (value) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned =
        encode({ alg: 'HS256', typ: 'JWT' }) +
        '.' +
        encode({
          typ: 'app_coordination',
          iss: 'tuturuuu',
          aud: 'tuturuuu-api',
          sub: userId,
          email: user.email,
          origin_app: 'web',
          target_app: target,
          iat: now,
          exp: now + 3600,
          jti: randomUUID(),
          scopes: ['internal-app:session'],
        });
      return (
        'ttr_app_' +
        unsigned +
        '.' +
        createHmac('sha256', secret).update(unsigned).digest('base64url')
      );
    }
    const cookie =
      'tuturuuu_app_session=' +
      token('playground') +
      '; tuturuuu_web_app_session=' +
      token('web');
    const get = (path, host, signed) =>
      new Promise((resolve, reject) => {
        httpRequest(
          {
            hostname: listener.hostname,
            port: listener.port,
            path,
            headers: { host, ...(signed ? { cookie } : {}) },
            signal: t.signal,
          },
          (response) => {
            const chunks = [];
            response.on('error', reject);
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
          }
        )
          .on('error', reject)
          .end();
      });
    function policy(response) {
      assert.match(response.headers['cache-control'] ?? '', /no-store/u);
      assert.ok(response.headers['x-robots-tag']);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['x-frame-options'], 'DENY');
      assert.match(
        response.headers['content-security-policy'] ?? '',
        /frame-ancestors 'none'/u
      );
      assert.equal(
        response.headers['referrer-policy'],
        'strict-origin-when-cross-origin'
      );
    }
    for (const [host, base] of [
      ['playground.tuturuuu.com', ''],
      ['playground.tutur3u.com', ''],
      ['tuturuuu.com', '/playground'],
    ]) {
      for (const path of ['/', '/tool-calling', '/__native-smoke-missing__']) {
        await t.test(host + base + path, async () => {
          const target = path === '/' && base ? base : base + path;
          const anonymous = await get(target, host, false);
          assert.equal(anonymous.status, 307);
          assert.ok(
            anonymous.headers.location.startsWith(
              'https://central.invalid/login?'
            )
          );
          policy(anonymous);
          const before = calls.length;
          const signed = await get(target, host, true);
          assert.equal(signed.status, path.includes('missing') ? 404 : 200);
          assert.match(signed.headers['content-type'] ?? '', /text\/html/u);
          assert.match(signed.body, /<html[\s>]/iu);
          policy(signed);
          if (path.includes('missing')) {
            assert.deepEqual(
              brandedNotFoundProblems(signed, [
                user.email,
                userId,
                'Synthetic Staff',
                'Loading...',
              ]),
              []
            );
          } else {
            assert.match(signed.body, /Loading\.\.\./u);
          }
          const login = new URL(anonymous.headers.location);
          assert.equal(login.pathname, '/login');
          assert.equal(
            login.searchParams.get('returnUrl'),
            `http://${host}${target}`
          );
          if (!path.includes('missing')) {
            assert.ok(
              calls.slice(before).includes('auth'),
              'verified current Auth identity'
            );
            assert.ok(
              calls.slice(before).includes('membership'),
              'verified root membership'
            );
          }
        });
      }
    }
    assert.deepEqual(unexpected, []);
  }
);

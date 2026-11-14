import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));

// The canonical host and the host the Worker also serves as a root host.
const HOSTS = ['nova.ai.vn', 'nova.tuturuuu.com'];
// One marker per top-level dashboard page, taken from that page module's own
// server-rendered markup. Each marker appears in exactly one of these pages,
// so a route that rendered another module (such as /home) cannot pass.
const PAGE_MARKERS = {
  '/home': '>Welcome to the Future of Prompt Engineering</h1>',
  '/problems': '>Problems</h1>',
  '/sessions': '>Currently active sessions<',
  '/submissions': 'placeholder="Search by email..."',
  '/users': '>User Management</h1>',
  '/users/whitelist': '>Whitelisted emails</h1>',
  '/teams': '>Teams</h1>',
  '/leaderboard': '>Total Player<',
  '/leaderboard/teams': '>Total Teams<',
  '/challenges': '>Prompt Engineering Challenges</h1>',
  '/judges': '>Judging Challenges<',
  '/score-calculator': '>Score Calculator</h1>',
};
// Routes behind the (admin) and (leaderboard) management gates.
const GATED = ['/problems', '/sessions', '/submissions', '/users', '/teams'];
const SUPABASE_ORIGIN = 'https://fixture.supabase.invalid';
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const ADMIN_ROLE = {
  user_id: USER_ID,
  enabled: true,
  allow_challenge_management: true,
  allow_manage_all_challenges: true,
  allow_role_management: true,
};
const MEMBER_ROLE = {
  user_id: USER_ID,
  enabled: true,
  allow_challenge_management: false,
  allow_manage_all_challenges: false,
  allow_role_management: false,
};

const base64Url = (value) => Buffer.from(value).toString('base64url');

// A synthetic nova app session, signed with this run's random coordination
// secret in the shape packages/utils/src/app-coordination-token.ts verifies.
// It is the session cookie every nova host accepts.
function appSessionCookie(secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      aud: 'tuturuuu-api',
      email: 'route-fixture@example.invalid',
      exp: now + 3600,
      iat: now,
      iss: 'tuturuuu',
      jti: randomUUID(),
      origin_app: 'web',
      scopes: ['internal-app:session'],
      sub: USER_ID,
      target_app: 'nova',
      typ: 'app_coordination',
    })
  );
  const unsigned = `${header}.${claims}`;
  const signature = createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  return `tuturuuu_app_session=ttr_app_${unsigned}.${signature}`;
}

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-range': '0-0/0',
    },
  });

test(
  'emitted nova Worker renders each top-level route with its own page module',
  { timeout: 300000 },
  async (t) => {
    assert.equal(
      process.env.CI,
      'true',
      'Requires the exact emitted native build'
    );
    assert.match(process.env.CI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
    const { configPath } = readNativeRuntimeConfig(app);
    const scratch = await mkdtemp(join(tmpdir(), 'nova-route-modules-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const envFile = join(scratch, 'synthetic.env');
    await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
    const registry = join(scratch, 'registry');
    await mkdir(registry);

    const coordinationSecret = randomBytes(32).toString('hex');
    const cookie = appSessionCookie(coordinationSecret);
    // The fixture Supabase answers as the role under test; every other origin
    // is denied. Nothing leaves the host.
    let role = ADMIN_ROLE;
    const egress = [];
    const sdk = require('wrangler');
    const worker = await sdk.unstable_startWorker({
      config: join(scratch, relative(app, configPath)),
      envFiles: [envFile],
      sendMetrics: false,
      bindings: {
        TUTURUUU_APP_COORDINATION_SECRET: {
          type: 'secret_text',
          value: coordinationSecret,
        },
        SUPABASE_SECRET_KEY: {
          type: 'secret_text',
          value: randomBytes(32).toString('hex'),
        },
        NEXT_PUBLIC_SUPABASE_URL: {
          type: 'plain_text',
          value: SUPABASE_ORIGIN,
        },
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
          type: 'plain_text',
          value: 'sb_publishable_fixture',
        },
        // Not an absolute URL, so guard stores resolve as unavailable.
        UPSTASH_REDIS_REST_URL: {
          type: 'plain_text',
          value: 'synthetic-runtime-only',
        },
        UPSTASH_REDIS_REST_TOKEN: {
          type: 'secret_text',
          value: randomBytes(32).toString('hex'),
        },
        INTERNAL_WEB_API_ORIGIN: {
          type: 'plain_text',
          value: 'https://central.invalid',
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
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth forbidden');
        },
        outboundService(request) {
          assert.ok(egress.length < 4000, 'Egress operation budget');
          const url = new URL(request.url);
          egress.push(url.origin);
          if (url.origin !== SUPABASE_ORIGIN)
            return new Response('{"error":"denied by the route test"}', {
              status: 401,
              headers: { 'content-type': 'application/json' },
            });
          if (url.pathname.startsWith('/rest/v1/platform_user_roles')) {
            const accept = request.headers.get('accept') ?? '';
            return json(accept.includes('vnd.pgrst.object') ? role : [role]);
          }
          if (url.pathname.startsWith('/rest/v1/')) return json([]);
          return json({});
        },
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const origin = await worker.url;
    // node:http keeps the raw Host header; fetch() would replace it.
    const get = (host, path, headers = {}) =>
      new Promise((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: origin.hostname,
            port: origin.port,
            path,
            headers: { host, accept: 'text/html', ...headers },
          },
          (response) => {
            const bytes = [];
            response.on('data', (part) => bytes.push(part));
            response.on('error', reject);
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                location: response.headers.location ?? null,
                body: Buffer.concat(bytes).toString('utf8'),
              })
            );
          }
        );
        request.on('error', reject);
        request.setTimeout(60000, () =>
          request.destroy(new Error('Runtime response deadline'))
        );
        request.end();
      });
    const signedIn = (host, path) =>
      get(host, path, { cookie, 'accept-language': 'en' });
    const visibleMarkup = (body) =>
      body.replace(/<script\b[\s\S]*?<\/script>/giu, '');
    const redirectTarget = (host, location) =>
      new URL(location ?? '', `http://${host}`);

    for (const host of HOSTS) {
      await t.test(`${host}: the session fixture is what admits`, async () => {
        const anonymous = await get(host, '/problems');
        assert.equal(anonymous.status, 307, 'anonymous /problems');
        assert.equal(
          redirectTarget(host, anonymous.location).pathname,
          '/login',
          'anonymous /problems goes to central login'
        );
      });

      await t.test(
        `${host}: an admin gets each route's own page module`,
        async () => {
          role = ADMIN_ROLE;
          for (const [path, marker] of Object.entries(PAGE_MARKERS)) {
            const response = await signedIn(host, path);
            assert.equal(
              response.status,
              200,
              `${host}${path}: ${response.status} ${response.location ?? ''}`
            );
            const markup = visibleMarkup(response.body);
            assert.ok(markup.includes(marker), `${host}${path}: own marker`);
            for (const [other, otherMarker] of Object.entries(PAGE_MARKERS))
              if (other !== path)
                assert.ok(
                  !markup.includes(otherMarker),
                  `${host}${path}: rendered the ${other} module`
                );
          }
        }
      );

      await t.test(
        `${host}: a non-admin is redirected from management routes to /home`,
        async (st) => {
          role = MEMBER_ROLE;
          st.after(() => {
            role = ADMIN_ROLE;
          });
          for (const path of GATED) {
            const response = await signedIn(host, path);
            assert.equal(response.status, 307, `${host}${path}`);
            const target = redirectTarget(host, response.location);
            assert.equal(target.host, host, `${host}${path}: redirect host`);
            assert.equal(target.pathname, '/home', `${host}${path}: target`);
          }
          const open = await signedIn(host, '/challenges');
          assert.equal(open.status, 200, `${host}/challenges`);
          assert.ok(
            visibleMarkup(open.body).includes(PAGE_MARKERS['/challenges'])
          );
        }
      );
    }

    await t.test('unknown hosts are rejected before app code', async () => {
      for (const host of [
        'tuturuuu.com',
        'nova.ai.vn.attacker.invalid',
        'unknown-host.invalid',
      ]) {
        const before = egress.length;
        const response = await signedIn(host, '/problems');
        assert.equal(response.status, 404, `${host}: ${response.status}`);
        assert.equal(response.body, 'Not Found', `${host}: app content`);
        assert.equal(egress.length, before, `${host}: egress`);
      }
    });

    t.diagnostic(
      `fixture egress origins: ${[...new Set(egress)].join(', ') || 'none'}`
    );
  }
);

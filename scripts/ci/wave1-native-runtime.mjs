// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; deployment credentials never enter Turbo builds.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verify } from './wave1-native-artifact.mjs';

// CI-only: starts workerd from sealed prebundled bytes, never builds or publishes.
assert.equal(process.env.CI, 'true');
const [app, environment, sha] = process.argv.slice(2);
const appRoot = resolve('apps', app);
const { receipt } = verify(appRoot, app, environment, sha);
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
// Calendar staging verifies Access JWTs itself; serve fixture team keys only.
const access =
  app === 'calendar' && environment === 'staging' ? accessFixture() : null;
// N8/N9: each Calendar artifact must 404 the other environment's host.
const foreignHost =
  app === 'calendar'
    ? environment === 'production'
      ? 'calendar.staging.tutur3u.com'
      : 'calendar.tuturuuu.com'
    : null;
let clean = false;
try {
  const hosts = [receipt.profile.host];
  if (app === 'apps' && environment === 'staging')
    hosts.push('apps.tuturuuu.com');
  if (foreignHost) hosts.push(foreignHost);
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
                  : (access?.bindings[name] ?? 'wave1_disposable_fixture_only'),
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
      const fetchWorker = (path, init = {}, jwt = access?.token()) =>
        worker.fetch(`https://${host}${path}`, {
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
      const post = await fetchWorker('/api/build-info', { method: 'POST' });
      assert.equal(
        post.status,
        405,
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
      const response = await fetchWorker(`/${file.slice('client/'.length)}`);
      assert.equal(response.status, 200);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        await readFile(join(appRoot, 'dist', file))
      );
      if (app === 'mail' || app === 'calendar') {
        const page = await fetchWorker(
          '/en/00000000-0000-4000-8000-000000000001'
        );
        assert.equal(
          page.status,
          307,
          'Anonymous native page must hand off to central login'
        );
        const target = new URL(page.headers.get('location'));
        assert.equal(
          target.hostname,
          environment === 'production' ? 'tuturuuu.com' : 'tutur3u.com'
        );
        assert.ok(target.pathname.includes('login'));
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

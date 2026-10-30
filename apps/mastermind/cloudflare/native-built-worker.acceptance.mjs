import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

test('sealed emitted Worker enforces admission and renders bilingual owner shell', {
  timeout: 120000,
}, async (t) => {
  assert.equal(process.env.CI, 'true', 'CI emitted artifact only');
  const app = fileURLToPath(new URL('../', import.meta.url));
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.assets.run_worker_first, true);
  const scratch = await mkdtemp(join(tmpdir(), 'mastermind-runtime-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry);
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwks = JSON.stringify({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'fixture' }],
  });
  const secret = randomBytes(48).toString('hex');
  const email = 'owner@example.invalid';
  const seconds = Math.floor(Date.now() / 1000);
  const access = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer('https://fixture.cloudflareaccess.com')
    .setAudience('fixture')
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 300)
    .sign(keys.privateKey);
  const claims = {
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: 'owner',
    email,
    target_app: 'mastermind',
    origin_app: 'web',
    scopes: ['internal-app:session'],
    iat: seconds,
    exp: seconds + 300,
    jti: randomUUID(),
  };
  const b64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims);
  const session =
    'ttr_app_' +
    content +
    '.' +
    createHmac('sha256', secret).update(content).digest('base64url');
  const plain = (value) => ({ type: 'plain_text', value });
  const require = createRequire(join(app, 'package.json'));
  const worker = await require('wrangler').unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      CF_ACCESS_TEAM_DOMAIN: plain('fixture.cloudflareaccess.com'),
      CF_ACCESS_AUD: plain('fixture'),
      MASTERMIND_OWNER_EMAIL: plain(email),
      OWNER_IDS: plain('owner'),
      TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
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
      // Match the hosted request scheme without changing the loopback listener.
      origin: { secure: true },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden');
      },
      outboundService: async (request) => {
        if (
          request.url ===
          'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs'
        ) {
          return new Response(jwks, {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error('Application data reads forbidden');
      },
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const headers = {
    'Cf-Access-Jwt-Assertion': access,
    Authorization: 'Bearer ' + session,
  };
  for (const host of [
    'preview.mastermind.example.invalid',
    'mastermind.account.workers.dev',
  ]) {
    assert.equal(
      (await worker.fetch('https://' + host + '/en', { headers })).status,
      403
    );
  }
  assert.equal(
    (await worker.fetch('https://mastermind.tuturuuu.com/en')).status,
    403
  );
  assert.equal(
    (
      await worker.fetch('https://mastermind.tuturuuu.com/en', {
        headers: { 'Cf-Access-Jwt-Assertion': access },
      })
    ).status,
    403
  );
  for (const path of ['/mastermind', '/mastermind/en']) {
    assert.equal(
      (await worker.fetch('https://tuturuuu.com' + path, { headers })).status,
      403
    );
  }
  const root = await worker.fetch('https://mastermind.tuturuuu.com/', {
    headers,
    redirect: 'manual',
  });
  assert.equal(root.status, 303);
  assert.equal(root.headers.get('Location'), '/en');
  for (const locale of ['en', 'vi']) {
    const response = await worker.fetch(
      'https://mastermind.tuturuuu.com/' + locale,
      { headers }
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const html = await response.text();
    assert.ok(html.includes(email));
    assert.ok(html.includes(locale === 'en' ? 'Coming soon' : 'Sắp ra mắt'));
  }
});

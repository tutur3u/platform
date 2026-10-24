import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { createShortenerFixture } from './native-fixture.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
const WORKER = 'tuturuuu-shortener-vite-staging';
const PUBLIC_FILES = [
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'apple-touch-icon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon.ico',
  'robots.txt',
  'site.webmanifest',
];

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

// Run a disposable copy so runtime state can never touch the sealed output.
async function stageArtifact() {
  const { configPath, config } = readNativeRuntimeConfig(app);
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'shortener-native-'))
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
    config,
    envFile,
    registry,
    configPath: join(scratch, relative(app, configPath)),
  };
}

test('emitted Shortener Worker preserves redirects, aliases, pages and API ownership', {
  timeout: 120000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Run only after the owning CI native build, never as a source-only unit test'
  );
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const staged = await stageArtifact();
  t.after(() => rm(staged.scratch, { recursive: true, force: true }));
  const { config } = staged;
  assert.equal(config.name, WORKER);
  assert.equal(config.no_bundle, true);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.deepEqual(config.vars, { TUTURUUU_NOINDEX: '1' });
  for (const name of PUBLIC_FILES)
    assert.equal(
      await sha256(join(app, 'dist/client', name)),
      await sha256(join(app, 'public', name)),
      `Public file drift: ${name}`
    );

  const bcrypt = require('bcryptjs');
  const fixture = createShortenerFixture({
    passwordHash: bcrypt.hashSync('correct horse', 10),
  });
  const secret = randomBytes(32).toString('hex');
  const plain = (value) => ({ type: 'plain_text', value });
  const sdk = require('wrangler');
  assert.equal(typeof sdk.unstable_startWorker, 'function');
  const worker = await sdk.unstable_startWorker({
    config: staged.configPath,
    envFiles: [staged.envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: plain(fixture.origin),
      NEXT_PUBLIC_SUPABASE_URL: plain(fixture.origin),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('fixture-public-key'),
      SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
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
      registry: staged.registry,
      server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden in Shortener fixture');
      },
      outboundService: fixture.outboundService,
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const url = await worker.url;
  assert.equal(url.hostname, '127.0.0.1');
  const origin = url.origin;
  const get = (path, init = {}) =>
    fetch(`${origin}${path}`, { redirect: 'manual', ...init });

  await t.test('build identity is the exact compiled source', async () => {
    const info = await (await get('/api/build-info')).json();
    assert.equal(info.appName, 'shortener');
    assert.equal(info.commitHash, source);
    assert.equal(
      (await get('/api/build-info', { method: 'POST' })).status,
      405
    );
  });

  await t.test(
    'generated slugs and custom aliases redirect exactly',
    async () => {
      for (const slug of ['abc123', 'My-Alias_1']) {
        const before = fixture.clicks.length;
        const response = await get(`/${slug}?ref=x&ref=y`, {
          headers: { 'user-agent': 'shortener-acceptance' },
        });
        assert.equal(response.status, 307);
        assert.equal(
          response.headers.get('location'),
          'https://example.com/landing?utm=a&utm=b'
        );
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.equal(
          response.headers.get('x-robots-tag'),
          'noindex, nofollow, nosnippet'
        );
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        assert.equal(fixture.clicks.length, before + 1);
        assert.equal(fixture.clicks.at(-1).link_id, 'link-open');
        assert.equal(fixture.clicks.at(-1).user_agent, 'shortener-acceptance');
      }
      assert.ok(fixture.slugReads.includes('My-Alias_1'));
      const head = await get('/abc123', { method: 'HEAD' });
      assert.equal(head.status, 307);
      const root = await get('/?a=1');
      assert.equal(root.status, 307);
      assert.equal(root.headers.get('location'), 'https://tuturuuu.com');
      const slash = await get('/abc123/?a=1&a=2');
      assert.equal(slash.status, 308);
      assert.equal(slash.headers.get('location'), '/abc123?a=1&a=2');
      assert.equal((await get('/%ZZ')).status, 400);
      assert.equal((await get('/abc123', { method: 'POST' })).status, 405);
    }
  );

  await t.test(
    'production hosts stay fenced and aliases keep raw queries',
    async () => {
      for (const host of ['ttr.gg', 'www.ttr.gg', 'shortener.tuturuuu.com']) {
        const before = fixture.clicks.length;
        const response = await worker.fetch(`https://${host}/abc123?a=1&a=2`, {
          redirect: 'manual',
        });
        assert.equal(response.status, 503);
        await response.text();
        assert.equal(fixture.clicks.length, before);
      }
    }
  );

  await t.test(
    'Start SSR renders status pages and the password form',
    async () => {
      const reads = fixture.clicks.length;
      const missing = await get('/missing-link');
      assert.equal(missing.status, 200);
      assert.match(await missing.text(), /Link Not Found/);
      const invalid = await get('/broken');
      assert.equal(invalid.status, 200);
      assert.match(await invalid.text(), /Invalid URL/);
      const nested = await get('/a/b');
      assert.equal(nested.status, 404);
      await nested.text();
      const locked = await get('/locked');
      assert.equal(locked.status, 200);
      const html = await locked.text();
      assert.match(html, /<html[^>]*lang="en"/);
      assert.match(html, /Password Protected/);
      assert.match(html, /first pet/);
      assert.match(html, /noindex, nofollow/);
      assert.ok(!html.includes('locked.example'), 'Target must stay hidden');
      assert.ok(!html.includes(secret), 'Secrets must never reach SSR');
      const scripts = [...html.matchAll(/src="(\/assets\/[^" ]+\.js)"/g)];
      assert.ok(scripts.length > 0, 'Native Start must emit client scripts');
      for (const [, script] of scripts)
        assert.equal((await get(script)).status, 200);
      for (const name of PUBLIC_FILES)
        assert.equal((await get(`/${name}`)).status, 200);
      assert.equal(fixture.clicks.length, reads);
    }
  );

  await t.test(
    'password verification is local, guarded and audited',
    async () => {
      const verify = (body, headers = {}) =>
        get('/api/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
        });
      const clicks = fixture.clicks.length;
      const wrong = await verify(
        JSON.stringify({
          linkId: 'link-locked',
          slug: 'locked',
          password: 'no',
        })
      );
      assert.equal(wrong.status, 403);
      assert.equal(fixture.clicks.length, clicks);
      const right = await verify(
        JSON.stringify({
          linkId: 'link-locked',
          slug: 'locked',
          password: 'correct horse',
        })
      );
      assert.equal(right.status, 200);
      assert.deepEqual(await right.json(), {
        url: 'https://locked.example/private',
        success: true,
      });
      assert.equal(fixture.clicks.length, clicks + 1);
      assert.equal((await verify('{"linkId":1}')).status, 400);
      assert.equal(
        (await verify(JSON.stringify({ linkId: 'none', password: 'x' })))
          .status,
        404
      );
      assert.equal((await get('/api/verify')).status, 405);
      const oversized = await verify('x'.repeat(600 * 1024));
      assert.equal(oversized.status, 413);
      const bearer = await verify('{}', {
        authorization: 'Bearer ttr_app_invalid',
      });
      assert.equal(bearer.status, 401);
      assert.equal(fixture.clicks.length, clicks + 1);
    }
  );

  await t.test(
    'unowned API paths reach central with raw query and cookies',
    async () => {
      const response = await get('/api/v1/links/check?tag=1&tag=2&x=%20', {
        method: 'PATCH',
        headers: { cookie: 'fixture=1', 'content-type': 'application/json' },
        body: '{"title":"exact"}',
      });
      assert.equal(response.status, 403);
      assert.deepEqual(response.headers.getSetCookie(), [
        'fixture_a=1; Path=/',
        'fixture_b=2; Path=/',
      ]);
      assert.equal(await response.text(), '{"message":"tenant denied"}');
      assert.deepEqual(fixture.central, [
        {
          method: 'PATCH',
          path: '/api/v1/links/check?tag=1&tag=2&x=%20',
          body: '{"title":"exact"}',
          cookie: 'fixture=1',
        },
      ]);
    }
  );

  assert.deepEqual(fixture.unexpected, [], 'Zero unadmitted runtime egress');
});

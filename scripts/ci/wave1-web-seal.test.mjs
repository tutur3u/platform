import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { verify } from './wave1-native-artifact.mjs';
import { main } from './wave1-web-seal.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
const sha = 'a'.repeat(40);

test('the sealed Web config binds the Cloudflare-only staging vars', (t) => {
  const dir = fixture(t, 'web');
  const digest = main(['prepare', sha], {}, dir);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  const config = JSON.parse(
    readFileSync(join(dir, 'dist/wave1/wrangler.json'), 'utf8')
  );
  assert.equal(config.name, 'tuturuuu-web-wave1-staging');
  assert.equal(Object.hasOwn(config.vars, 'NEXT_FALLBACK_ORIGIN'), false);
  assert.equal(config.vars.WEB_START_CANDIDATE, 'staging');
  assert.equal(config.vars.WEB_START_NATIVE_LEGAL, 'off');
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.secrets.required.sort(), [
    'CF_ACCESS_AUD',
    'CF_ACCESS_TEAM_DOMAIN',
    'TRUSTED_PROXY_ORIGIN_SECRET',
  ]);
  const { receipt } = verify(dir, 'web', 'staging', sha);
  assert.equal(Object.hasOwn(receipt.profile, 'nextFallback'), false);
  assert.equal(main(['verify', sha], {}, dir), digest);
});

test('a tampered sealed config fails verification', (t) => {
  const dir = fixture(t, 'web');
  main(['prepare', sha], {}, dir);
  const path = join(dir, 'dist/wave1/wrangler.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  config.vars.NEXT_FALLBACK_ORIGIN = 'https://tutur3u.com';
  writeFileSync(path, JSON.stringify(config));
  assert.throws(() => main(['verify', sha], {}, dir));
});

test('sealing is credential-free and restore recreates only the Void pointer', (t) => {
  assert.throws(
    () =>
      main(
        ['prepare', sha],
        { CLOUDFLARE_STAGING_API_TOKEN: 'x' },
        fixture(t, 'web')
      ),
    /credential-free/
  );
  const dir = fixture(t, 'web');
  main(['prepare', sha], {}, dir);
  const pointer = join(dir, '.wrangler/deploy/config.json');
  writeFileSync(pointer, '{}');
  main(['restored', sha], {}, dir);
  assert.ok(existsSync(pointer));
  assert.deepEqual(JSON.parse(readFileSync(pointer, 'utf8')), {
    auxiliaryWorkers: [],
    configPath: '../../dist/server/wrangler.json',
  });
});

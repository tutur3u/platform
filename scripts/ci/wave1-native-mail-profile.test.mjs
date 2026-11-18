import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepare, verify } from './wave1-native-artifact.mjs';
import { ingressTarget } from './wave1-ingress-topology.mjs';
import { assertStagingIsolation, profileFor } from './wave1-native-profile.mjs';
import { fixture } from './wave1-native-test-fixture.cjs';

const sha = 'a'.repeat(40);
const accessNames = [
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUD',
  'CF_ACCESS_CLIENT_ID',
  'CF_ACCESS_CLIENT_SECRET',
];

test('Mail staging profile uses its Access-protected staging hostname', () => {
  const profile = profileFor('mail', 'staging');
  assert.equal(profile.host, 'mail.tutur3u.com');
  assert.equal(profile.name, 'tuturuuu-mail-wave1-staging');
  assert.equal(
    profileFor('mail', 'staging', 'owner-example').host,
    profile.host
  );
  assert.deepEqual(ingressTarget('mail'), {
    app: 'mail',
    host: 'mail.tutur3u.com',
    worker: 'tuturuuu-mail-wave1-staging',
    issuer: false,
  });
});

test('Mail staging secret names add Access names that production never carries', () => {
  const staging = profileFor('mail', 'staging');
  const production = profileFor('mail', 'production');
  for (const name of accessNames) {
    assert.ok(staging.secrets.includes(name), `staging lacks ${name}`);
    assert.ok(!production.secrets.includes(name), `production has ${name}`);
  }
  for (const name of production.secrets)
    assert.ok(staging.secrets.includes(name), `staging lacks ${name}`);
  assert.equal(production.host, 'mail.tuturuuu.com');
  assert.equal(production.name, 'tuturuuu-mail');
});

test('Mail staging seal restores its explicit host without a provider subdomain', (t) => {
  const app = fixture(t, 'mail');
  const receipt = prepare(app, 'mail', 'staging', undefined, sha);
  const restored = verify(app, 'mail', 'staging', sha);
  assert.deepEqual(restored.receipt, receipt);
  const config = JSON.parse(readFileSync(restored.config, 'utf8'));
  assertStagingIsolation(config);
  assert.equal(config.name, 'tuturuuu-mail-wave1-staging');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(
    config.vars.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN,
    '.staging.tutur3u.com'
  );
  assert.equal(config.vars.NEXT_PUBLIC_APP_URL, 'https://mail.tutur3u.com');
  assert.equal(
    config.vars.NEXT_PUBLIC_MAIL_APP_URL,
    'https://mail.tutur3u.com'
  );
  assert.equal(config.vars.NEXT_PUBLIC_WEB_APP_URL, 'https://web.tutur3u.com');
  assert.equal(config.vars.MAIL_R2_BUCKET_NAME, 'tuturuuu-mail-wave1-staging');
  assert.equal(config.vars.TUTURUUU_NOINDEX, '1');
});

test('Mail production seal keeps its production identity and no Access names', (t) => {
  const app = fixture(t, 'mail');
  prepare(app, 'mail', 'production', undefined, sha);
  const restored = verify(app, 'mail', 'production', sha);
  const config = JSON.parse(readFileSync(restored.config, 'utf8'));
  assert.equal(config.name, 'tuturuuu-mail');
  assert.equal(config.vars.NEXT_PUBLIC_APP_URL, 'https://mail.tuturuuu.com');
  assert.equal(
    Object.hasOwn(config.vars, 'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN'),
    false
  );
  assert.deepEqual(
    restored.receipt.profile.secrets.filter((name) =>
      accessNames.includes(name)
    ),
    []
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePublicConfig } from './public-config.mjs';

const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publicExample',
  API_BASE_URL: 'https://tuturuuu.com',
};

test('accepts only public client settings and returns a detached object', () => {
  const input = { ...config, MAIL_API_BASE_URL: 'https://mail.tuturuuu.com' };
  assert.deepEqual(validatePublicConfig(input), input);
  assert.notEqual(validatePublicConfig(input), input);
});

test('rejects credentials and unknown future fields without echoing their values', () => {
  for (const key of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'GH_TOKEN',
    'APPLE_PRIVATE_KEY',
    'NEW_PUBLIC_FIELD',
  ]) {
    assert.throws(
      () => validatePublicConfig({ ...config, [key]: 'sensitive-marker' }),
      (error) => !error.message.includes('sensitive-marker')
    );
  }
});

test('rejects service-role JWTs even when placed in the public key field', () => {
  const jwt = (role) =>
    `e30.${Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url')}.signature`;
  assert.throws(() =>
    validatePublicConfig({
      ...config,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('service_role'),
    })
  );
  assert.doesNotThrow(() =>
    validatePublicConfig({
      ...config,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon'),
    })
  );
  assert.throws(() =>
    validatePublicConfig({
      ...config,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private',
    })
  );
});

test('rejects malicious or credential-bearing origins', () => {
  for (const url of [
    'http://tuturuuu.com',
    'https://tuturuuu.com.evil.test',
    'https://user:password@tuturuuu.com',
    'https://tuturuuu.com?secret=x',
    'https://localhost',
    'https://evil.test',
  ]) {
    assert.throws(() => validatePublicConfig({ ...config, API_BASE_URL: url }));
  }
});

test('requires production configuration and bounded single-line values', () => {
  assert.throws(() => validatePublicConfig({}));
  assert.throws(() => validatePublicConfig([]));
  assert.throws(() =>
    validatePublicConfig({ ...config, TURNSTILE_SITE_KEY: 'x\nsecret' })
  );
  assert.throws(() =>
    validatePublicConfig({ ...config, TURNSTILE_SITE_KEY: 'x'.repeat(4097) })
  );
  assert.throws(() =>
    validatePublicConfig({
      ...config,
      MOBILE_CALENDAR_INTEGRATIONS_ENABLED: 'yes',
    })
  );
});

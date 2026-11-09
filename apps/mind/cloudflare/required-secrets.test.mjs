import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredSecrets, REQUIRED_SECRETS } from './required-secrets.ts';

const secrets = Object.fromEntries(
  REQUIRED_SECRETS.map((name) => [name, 'synthetic-only'])
);

test('accepts either legacy Upstash or service binding configuration', () => {
  assert.doesNotThrow(() =>
    assertRequiredSecrets({ ...secrets, ABUSE_GUARD_BACKEND: 'upstash', UPSTASH_REDIS_REST_URL: 'url', UPSTASH_REDIS_REST_TOKEN: 'token' })
  );
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...base } = secrets;
  assert.doesNotThrow(() => assertRequiredSecrets({
    ...base, ABUSE_GUARD: {}, ABUSE_GUARD_KEY_PEPPER: 'pepper', ABUSE_GUARD_FAMILIES: 'proxy',
  }));
});

test('rejects half or absent guard configuration with missing names', () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...base } = secrets;
  assert.throws(() => assertRequiredSecrets({ ...base, ABUSE_GUARD: {}, ABUSE_GUARD_FAMILIES: 'proxy' }), /ABUSE_GUARD_KEY_PEPPER/u);
  assert.throws(() => assertRequiredSecrets(base), /ABUSE_GUARD/u);
});

test('still rejects every missing required secret', () => {
  for (const name of REQUIRED_SECRETS) {
    const bindings = { ...secrets, ABUSE_GUARD: {}, ABUSE_GUARD_KEY_PEPPER: 'pepper', ABUSE_GUARD_FAMILIES: 'proxy' };
    delete bindings[name];
    assert.throws(
      () => assertRequiredSecrets(bindings),
      /Missing required secrets/u
    );
  }
});

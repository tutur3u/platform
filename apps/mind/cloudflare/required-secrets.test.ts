import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRequiredSecrets, REQUIRED_SECRETS } from './required-secrets.ts';

const bindings = {
  ...Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, 'fixture'])),
  ABUSE_GUARD_BACKEND: 'upstash',
};
test('all required bindings admit startup', () => {
  assert.doesNotThrow(() => assertRequiredSecrets(bindings));
});
for (const name of REQUIRED_SECRETS) {
  test(`missing or blank ${name} refuses startup`, () => {
    const omitted = { ...bindings };
    delete omitted[name];
    assert.throws(() => assertRequiredSecrets(omitted), new RegExp(name));
    assert.throws(
      () => assertRequiredSecrets({ ...bindings, [name]: ' ' }),
      new RegExp(name)
    );
  });
}
test('binding configuration admits startup without Upstash', () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ABUSE_GUARD_BACKEND, ...rest } = bindings;
  assert.doesNotThrow(() => assertRequiredSecrets({
    ...rest,
    ABUSE_GUARD: {},
    ABUSE_GUARD_KEY_PEPPER: 'pepper',
    ABUSE_GUARD_FAMILIES: 'proxy',
  }));
});
test('half binding configuration reports the missing pepper name', () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ABUSE_GUARD_BACKEND, ...rest } = bindings;
  assert.throws(() => assertRequiredSecrets({ ...rest, ABUSE_GUARD: {}, ABUSE_GUARD_FAMILIES: 'proxy' }), /ABUSE_GUARD_KEY_PEPPER/);
});
test('neither configuration reports missing names only', () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ABUSE_GUARD_BACKEND, ...rest } = bindings;
  assert.throws(() => assertRequiredSecrets(rest), /ABUSE_GUARD/);
  assert.throws(() => assertRequiredSecrets({ ...rest, ABUSE_GUARD: {}, ABUSE_GUARD_KEY_PEPPER: 'secret-value' }), (error) => {
    assert.match(error.message, /ABUSE_GUARD_FAMILIES/);
    assert.doesNotMatch(error.message, /secret-value/);
    return true;
  });
});

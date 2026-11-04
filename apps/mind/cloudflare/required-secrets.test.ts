import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRequiredSecrets, REQUIRED_SECRETS } from './required-secrets.ts';
const bindings = Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, 'fixture']));
test('all required bindings admit startup', () => {
  assert.doesNotThrow(() => assertRequiredSecrets(bindings));
});
for (const name of REQUIRED_SECRETS) {
  test(`missing or blank ${name} refuses startup`, () => {
    const omitted = { ...bindings };
    delete omitted[name];
    assert.throws(() => assertRequiredSecrets(omitted), new RegExp(name));
    assert.throws(() => assertRequiredSecrets({ ...bindings, [name]: ' ' }), new RegExp(name));
  });
}
test('an override cannot disable the required Upstash backend', () => {
  assert.throws(() => assertRequiredSecrets({ ...bindings, ABUSE_GUARD_BACKEND: 'off' }), /ABUSE_GUARD_BACKEND/);
  assert.doesNotThrow(() => assertRequiredSecrets({ ...bindings, ABUSE_GUARD_BACKEND: 'upstash' }));
});

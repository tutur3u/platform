import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredSecrets, REQUIRED_SECRETS } from './required-secrets.ts';

const secrets = Object.fromEntries(
  REQUIRED_SECRETS.map((name) => [name, 'synthetic-only'])
);

test('requires an explicit upstash backend', () => {
  for (const backend of [undefined, null, '', 'memory', 'UPSTASH']) {
    assert.throws(
      () => assertRequiredSecrets({ ...secrets, ABUSE_GUARD_BACKEND: backend }),
      /ABUSE_GUARD_BACKEND=upstash/u
    );
  }
  assert.throws(
    () => assertRequiredSecrets(secrets),
    /ABUSE_GUARD_BACKEND=upstash/u
  );
  assert.doesNotThrow(() =>
    assertRequiredSecrets({ ...secrets, ABUSE_GUARD_BACKEND: 'upstash' })
  );
});

test('still rejects every missing required secret', () => {
  for (const name of REQUIRED_SECRETS) {
    const bindings = { ...secrets, ABUSE_GUARD_BACKEND: 'upstash' };
    delete bindings[name];
    assert.throws(
      () => assertRequiredSecrets(bindings),
      /Missing required secrets/u
    );
  }
});

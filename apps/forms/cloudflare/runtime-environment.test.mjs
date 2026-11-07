import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeEnvironment,
  REQUIRED_RUNTIME_NAMES,
} from './runtime-environment.ts';

test('startup rejects every missing or blank required binding', () => {
  process.env.NODE_ENV = 'production';
  const valid = Object.fromEntries(
    REQUIRED_RUNTIME_NAMES.map((name) => [name, 'synthetic-unit-only'])
  );
  assert.doesNotThrow(() => assertRuntimeEnvironment(valid));
  for (const name of REQUIRED_RUNTIME_NAMES) {
    const missing = { ...valid };
    delete missing[name];
    assert.throws(() => assertRuntimeEnvironment(missing), {
      message: `Missing required runtime binding: ${name}`,
    });
    assert.throws(
      () => assertRuntimeEnvironment({ ...valid, [name]: ' ' }),
      /Missing required/
    );
  }
  assert.throws(
    () =>
      assertRuntimeEnvironment({
        ...valid,
        TUTURUUU_APP_COORDINATION_SECRET:
          'tuturuuu-local-development-app-coordination-secret',
      }),
    /Development coordination secret is forbidden/
  );
});

test('startup rejects a non-production runtime', () => {
  process.env.NODE_ENV = 'development';
  assert.throws(
    () => assertRuntimeEnvironment({}),
    /Worker requires NODE_ENV=production/
  );
});

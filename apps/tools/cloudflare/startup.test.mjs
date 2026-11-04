import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStartupEnvironment } from './startup.mjs';

const valid = {
  ASSETS: { fetch() {} },
  TUTURUUU_APP_COORDINATION_SECRET:
    'synthetic-tuturuuu_app_coordination_secret',
  NEXT_PUBLIC_SUPABASE_URL: 'synthetic-next_public_supabase_url',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    'synthetic-next_public_supabase_publishable_key',
};

test('startup refuses missing bindings, required values and development signing keys', () => {
  assert.doesNotThrow(() => assertStartupEnvironment(valid));
  for (const name of Object.keys(valid)) {
    const { [name]: removed, ...missing } = valid;
    assert.throws(() => assertStartupEnvironment(missing), new RegExp(name));
    if (name !== 'ASSETS') {
      assert.throws(
        () => assertStartupEnvironment({ ...valid, [name]: '  ' }),
        new RegExp(name)
      );
    }
  }
  assert.throws(
    () =>
      assertStartupEnvironment({
        ...valid,
        TUTURUUU_APP_COORDINATION_SECRET:
          'tuturuuu-local-development-app-coordination-secret',
      }),
    /Development/
  );
});

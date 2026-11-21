import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeEnvironment,
  REQUIRED_RUNTIME_NAMES,
} from './runtime-environment.ts';

const legacyRedis = {
  UPSTASH_REDIS_REST_URL: 'https://fixture.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-unit-only',
};

test('startup rejects every missing or blank required binding', () => {
  process.env.NODE_ENV = 'production';
  const valid = {
    ...Object.fromEntries(
      REQUIRED_RUNTIME_NAMES.map((name) => [name, 'synthetic-unit-only'])
    ),
    ...legacyRedis,
  };
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

test('startup accepts a configured guard without SePay or Redis credentials', () => {
  process.env.NODE_ENV = 'production';
  const valid = {
    CRON_SECRET: 'synthetic-unit-only',
    SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET: 'synthetic-unit-only',
    ENCRYPTION_MASTER_KEY: 'synthetic-unit-only',
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-unit-only',
    SUPABASE_SECRET_KEY: 'synthetic-unit-only',
    NEXT_PUBLIC_SUPABASE_URL: 'synthetic-unit-only',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-unit-only',
    ABUSE_GUARD: { run: async () => ({}) },
    ABUSE_GUARD_FAMILIES: 'proxy,ratelimit,integrity',
    ABUSE_GUARD_KEY_PEPPER: 'synthetic-unit-only-pepper-long-enough',
  };
  assert.doesNotThrow(() => assertRuntimeEnvironment(valid));
  assert.throws(
    () =>
      assertRuntimeEnvironment({
        ...valid,
        ABUSE_GUARD_FAMILIES: 'proxy,integrity',
      }),
    /requires a configured abuse guard/
  );
  assert.throws(
    () => assertRuntimeEnvironment({ ...valid, ABUSE_GUARD_KEY_PEPPER: '' }),
    /requires a configured abuse guard/
  );
  assert.throws(
    () =>
      assertRuntimeEnvironment({
        ...valid,
        ...legacyRedis,
        ABUSE_GUARD_KEY_PEPPER: '',
      }),
    /requires a configured abuse guard/
  );
});

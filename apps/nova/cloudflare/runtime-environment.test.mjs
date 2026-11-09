import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeEnvironment, REQUIRED_RUNTIME_NAMES } from './runtime-environment.ts';
const base = Object.fromEntries(REQUIRED_RUNTIME_NAMES.map((name) => [name, 'synthetic-unit-only']));
test('accepts legacy Upstash credentials', () => {
  process.env.NODE_ENV = 'production';
  assert.doesNotThrow(() => assertRuntimeEnvironment({ ...base, UPSTASH_REDIS_REST_URL: 'url', UPSTASH_REDIS_REST_TOKEN: 'token' }));
});
test('accepts complete abuse guard binding configuration', () => {
  process.env.NODE_ENV = 'production';
  assert.doesNotThrow(() => assertRuntimeEnvironment({ ...base, ABUSE_GUARD: {}, ABUSE_GUARD_KEY_PEPPER: 'pepper', ABUSE_GUARD_FAMILIES: 'proxy' }));
});
test('rejects a partial binding configuration with missing names only', () => {
  process.env.NODE_ENV = 'production';
  assert.throws(() => assertRuntimeEnvironment({ ...base, ABUSE_GUARD: {}, ABUSE_GUARD_FAMILIES: 'proxy' }), /ABUSE_GUARD_KEY_PEPPER/);
});
test('rejects neither backend', () => {
  process.env.NODE_ENV = 'production';
  assert.throws(() => assertRuntimeEnvironment(base), /UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeEnvironment,
  REQUIRED_RUNTIME_NAMES,
} from './runtime-environment.ts';
const base = Object.fromEntries(
  REQUIRED_RUNTIME_NAMES.map((name) => [name, 'synthetic-unit-only'])
);
test('accepts legacy Upstash credentials', () => {
  process.env.NODE_ENV = 'production';
  assert.doesNotThrow(() =>
    assertRuntimeEnvironment({
      ...base,
      UPSTASH_REDIS_REST_URL: 'url',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    })
  );
});
test('accepts complete abuse guard binding configuration', () => {
  process.env.NODE_ENV = 'production';
  assert.doesNotThrow(() =>
    assertRuntimeEnvironment({
      ...base,
      ABUSE_GUARD: {},
      ABUSE_GUARD_KEY_PEPPER: 'pepper',
      ABUSE_GUARD_FAMILIES: 'proxy',
    })
  );
});
test('rejects a partial binding configuration with missing names only', () => {
  process.env.NODE_ENV = 'production';
  assert.throws(
    () =>
      assertRuntimeEnvironment({
        ...base,
        ABUSE_GUARD: {},
        ABUSE_GUARD_FAMILIES: 'proxy',
      }),
    /ABUSE_GUARD_KEY_PEPPER/
  );
});

let isolate = 0;
// A fresh module instance stands in for a fresh Worker isolate.
async function freshIsolate() {
  isolate += 1;
  return import(`./runtime-environment.ts?isolate=${isolate}`);
}

function captureWarnings(t) {
  const lines = [];
  t.mock.method(console, 'warn', (...args) => lines.push(args.join(' ')));
  return lines;
}

test('unconfigured abuse guard is skipped and logged once by name', async (t) => {
  process.env.NODE_ENV = 'production';
  const { assertRuntimeEnvironment } = await freshIsolate();
  const lines = captureWarnings(t);
  assert.doesNotThrow(() => assertRuntimeEnvironment(base));
  assert.doesNotThrow(() =>
    assertRuntimeEnvironment({ ...base, ABUSE_GUARD_KEY_PEPPER: ' ' })
  );
  // The service binding is declared in the Worker configuration, so it alone
  // is not guard configuration.
  assert.doesNotThrow(() =>
    assertRuntimeEnvironment({ ...base, ABUSE_GUARD: {} })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[abuse-guard\] not configured; guard skipped/u);
  assert.doesNotMatch(lines[0], /synthetic|fixture/u);
});

test('any single abuse guard name still demands a complete configuration', async (t) => {
  process.env.NODE_ENV = 'production';
  const { assertRuntimeEnvironment } = await freshIsolate();
  const lines = captureWarnings(t);
  for (const partial of [
    { ABUSE_GUARD_KEY_PEPPER: 'secret-value' },
    { ABUSE_GUARD_FAMILIES: 'proxy' },
    { ABUSE_GUARD_KEY_PEPPER: 'secret-value', ABUSE_GUARD_FAMILIES: 'proxy' },
    { UPSTASH_REDIS_REST_URL: 'secret-url' },
    { UPSTASH_REDIS_REST_TOKEN: 'secret-token' },
  ]) {
    assert.throws(
      () => assertRuntimeEnvironment({ ...base, ...partial }),
      (error) => {
        assert.doesNotMatch(
          error.message,
          /secret-value|secret-url|secret-token/u
        );
        return true;
      }
    );
  }
  assert.equal(lines.length, 0);
});

test('core secrets stay required when the abuse guard is unconfigured', async (t) => {
  process.env.NODE_ENV = 'production';
  const { assertRuntimeEnvironment } = await freshIsolate();
  captureWarnings(t);
  for (const name of REQUIRED_RUNTIME_NAMES) {
    const bindings = { ...base };
    delete bindings[name];
    assert.throws(
      () => assertRuntimeEnvironment(bindings),
      new RegExp(name, 'u')
    );
    assert.throws(
      () => assertRuntimeEnvironment({ ...base, [name]: ' ' }),
      new RegExp(name, 'u')
    );
  }
});

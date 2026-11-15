import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredSecrets, REQUIRED_SECRETS } from './required-secrets.ts';

const secrets = Object.fromEntries(
  REQUIRED_SECRETS.map((name) => [name, 'synthetic-only'])
);

test('accepts either legacy Upstash or service binding configuration', () => {
  assert.doesNotThrow(() =>
    assertRequiredSecrets({
      ...secrets,
      ABUSE_GUARD_BACKEND: 'upstash',
      UPSTASH_REDIS_REST_URL: 'url',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    })
  );
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...base } = secrets;
  assert.doesNotThrow(() =>
    assertRequiredSecrets({
      ...base,
      ABUSE_GUARD: {},
      ABUSE_GUARD_KEY_PEPPER: 'pepper',
      ABUSE_GUARD_FAMILIES: 'proxy',
    })
  );
});

test('rejects half guard configuration with missing names', () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...base } = secrets;
  assert.throws(
    () =>
      assertRequiredSecrets({
        ...base,
        ABUSE_GUARD: {},
        ABUSE_GUARD_FAMILIES: 'proxy',
      }),
    /ABUSE_GUARD_KEY_PEPPER/u
  );
});

test('still rejects every missing required secret', () => {
  for (const name of REQUIRED_SECRETS) {
    const bindings = {
      ...secrets,
      ABUSE_GUARD: {},
      ABUSE_GUARD_KEY_PEPPER: 'pepper',
      ABUSE_GUARD_FAMILIES: 'proxy',
    };
    delete bindings[name];
    assert.throws(
      () => assertRequiredSecrets(bindings),
      /Missing required secrets/u
    );
  }
});

let isolate = 0;
// A fresh module instance stands in for a fresh Worker isolate.
async function freshIsolate() {
  isolate += 1;
  return import(`./required-secrets.ts?isolate=${isolate}`);
}

function captureWarnings(t) {
  const lines = [];
  t.mock.method(console, 'warn', (...args) => lines.push(args.join(' ')));
  return lines;
}

test('unconfigured abuse guard is skipped and logged once by name', async (t) => {
  const { assertRequiredSecrets } = await freshIsolate();
  const lines = captureWarnings(t);
  assert.doesNotThrow(() => assertRequiredSecrets(secrets));
  assert.doesNotThrow(() =>
    assertRequiredSecrets({ ...secrets, ABUSE_GUARD_KEY_PEPPER: ' ' })
  );
  // The service binding is declared in the Worker configuration, so it alone
  // is not guard configuration.
  assert.doesNotThrow(() =>
    assertRequiredSecrets({ ...secrets, ABUSE_GUARD: {} })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[abuse-guard\] not configured; guard skipped/u);
  assert.doesNotMatch(lines[0], /synthetic|fixture/u);
});

test('any single abuse guard name still demands a complete configuration', async (t) => {
  const { assertRequiredSecrets } = await freshIsolate();
  const lines = captureWarnings(t);
  for (const partial of [
    { ABUSE_GUARD_KEY_PEPPER: 'secret-value' },
    { ABUSE_GUARD_FAMILIES: 'proxy' },
    { ABUSE_GUARD_KEY_PEPPER: 'secret-value', ABUSE_GUARD_FAMILIES: 'proxy' },
    { UPSTASH_REDIS_REST_URL: 'secret-url' },
    { UPSTASH_REDIS_REST_TOKEN: 'secret-token' },
    { ABUSE_GUARD_BACKEND: 'upstash' },
    { ABUSE_GUARD_BACKEND: 'upstash', UPSTASH_REDIS_REST_URL: 'secret-url' },
  ]) {
    assert.throws(
      () => assertRequiredSecrets({ ...secrets, ...partial }),
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
  const { assertRequiredSecrets } = await freshIsolate();
  captureWarnings(t);
  for (const name of REQUIRED_SECRETS) {
    const bindings = { ...secrets };
    delete bindings[name];
    assert.throws(() => assertRequiredSecrets(bindings), new RegExp(name, 'u'));
    assert.throws(
      () => assertRequiredSecrets({ ...secrets, [name]: ' ' }),
      new RegExp(name, 'u')
    );
  }
});

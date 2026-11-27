import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTuturuuuMobileE2EConfig,
  mobileBundleId,
  mobileQaSession,
  mobileSessionCallback,
  offlineReplayExecutor,
} from './shared-mobile-config.ts';

const accessToken = `header.${Buffer.from('{"exp":2000}').toString('base64url')}.signature`;
const refreshToken = 'test-refresh-token';

test('isolates the dev bundle and selects iOS and Android independently', () => {
  const config = createTuturuuuMobileE2EConfig({
    env: {
      TUTURUUU_MOBILE_E2E_IOS_APP: 'Runner.app',
      TUTURUUU_MOBILE_E2E_ANDROID_APP: 'app.apk',
    },
  });

  assert.deepEqual(
    config.targets.map(({ name, app }) => [name, app.bundleId, app.appPath]),
    [
      ['ios', 'com.tuturuuu.app.mobile.dev', 'Runner.app'],
      ['android', 'com.tuturuuu.app.mobile.dev', 'app.apk'],
    ]
  );
  assert.equal(config.cache.dir, '.e2e/cache');
  assert.equal(config.cache.mode, 'read-write');
  assert.equal(config.agents.default.executor, offlineReplayExecutor);
  assert.equal(config.secrets, undefined);
});

test('staging is explicit and the production app is excluded', () => {
  const env = { TUTURUUU_MOBILE_E2E_FLAVOR: 'stg' };
  const config = createTuturuuuMobileE2EConfig({ env });
  for (const { app } of config.targets) {
    assert.equal(app.bundleId, 'com.tuturuuu.app.mobile.stg');
    assert.equal(app.environment, 'staging');
  }
  assert.throws(
    () => mobileBundleId({ TUTURUUU_MOBILE_E2E_FLAVOR: 'production' }),
    /must be dev or stg/
  );
});

test('local recording can opt into either an executor or a model', () => {
  const executor = { name: 'test-executor', runStep: () => assert.fail() };
  const model = { name: 'test-model' };
  assert.equal(
    createTuturuuuMobileE2EConfig({ env: {}, executor }).agents.default
      .executor,
    executor
  );
  assert.equal(
    createTuturuuuMobileE2EConfig({ env: {}, model }).agents.default.model,
    model
  );
});

test('CI is read-only and fails a cache miss without a model', async () => {
  const config = createTuturuuuMobileE2EConfig({
    env: { CI: 'true' },
    executor: { name: 'unexpected-executor', runStep: () => assert.fail() },
  });
  assert.equal(config.cache.mode, 'read-only');
  assert.equal(config.agents.default.model, undefined);
  assert.equal(config.agents.default.executor, offlineReplayExecutor);
  const result = await config.agents.default.executor.runStep();
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'MODEL_UNAVAILABLE');
});

test('accepts the env aliases, registers tokens for redaction, and rejects a partial pair', () => {
  for (const prefix of [
    'E2E_SECRET_MOBILE',
    'E2E_USER_MOBILE',
    'TUTURUUU_MOBILE_QA',
  ]) {
    const env = {
      [`${prefix}_ACCESS_TOKEN`]: accessToken,
      [`${prefix}_REFRESH_TOKEN`]: refreshToken,
    };
    assert.deepEqual(mobileQaSession(env), { accessToken, refreshToken });
    assert.deepEqual(createTuturuuuMobileE2EConfig({ env }).secrets, {
      'mobile-access-token': accessToken,
      'mobile-refresh-token': refreshToken,
    });
  }
  assert.throws(
    () => mobileQaSession({ E2E_SECRET_MOBILE_ACCESS_TOKEN: accessToken }),
    /complete mobile QA access and refresh token pair/
  );
});

test('uses the existing flavor callback and refuses expired or malformed tokens', () => {
  const session = { accessToken, refreshToken };
  const env = { TUTURUUU_MOBILE_E2E_FLAVOR: 'stg' };
  const callback = new URL(mobileSessionCallback(session, env, 1995));
  assert.equal(callback.protocol, 'com.tuturuuu.app.mobile.stg:');
  assert.equal(callback.hostname, 'login-callback');
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(callback.hash.slice(1))),
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: '5',
      token_type: 'bearer',
    }
  );
  assert.throws(() => mobileSessionCallback(session, env, 2000), /unexpired/);
  assert.throws(
    () => mobileSessionCallback({ accessToken: 'a.b.c', refreshToken }, env),
    /unexpired/
  );
});

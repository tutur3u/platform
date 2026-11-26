import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTuturuuuWebE2EConfig,
  offlineReplayExecutor,
  resolveFleetEmailFromEnv,
  resolveFleetPasswordFromEnv,
  TUTURUUU_HEADLESS_WEB_OPTIONS,
} from './shared-web-config.ts';

test('resolves fleet test identity strictly from env names without hardcoded defaults', () => {
  assert.equal(resolveFleetEmailFromEnv({}), '');
  assert.equal(resolveFleetPasswordFromEnv({}), '');

  const uuid = '11111111-2222-4333-8444-555555555555';
  assert.equal(
    resolveFleetEmailFromEnv({ TUTURUUU_FLEET_SMOKE_ID: uuid }),
    `qa-automation+${uuid}@smoke.tuturuuu.com`
  );
  assert.equal(
    resolveFleetEmailFromEnv({
      TUTURUUU_FLEET_SMOKE_ID: 'not-a-uuid',
    }),
    ''
  );
  assert.equal(
    resolveFleetEmailFromEnv({
      TUTURUUU_FLEET_SMOKE_ID: uuid,
      E2E_FLEET_EMAIL: 'override@example.test',
    }),
    'override@example.test'
  );
  assert.equal(
    resolveFleetPasswordFromEnv({
      TUTURUUU_FLEET_SMOKE_PASSWORD: 'ephemeral-fixture-value',
    }),
    'ephemeral-fixture-value'
  );
});

test('shared web config enforces headless Chromium defaults without UA spoofing or bypass headers', () => {
  assert.equal(TUTURUUU_HEADLESS_WEB_OPTIONS.browser, 'chromium');
  assert.equal('userAgent' in TUTURUUU_HEADLESS_WEB_OPTIONS, false);
  assert.equal('headers' in TUTURUUU_HEADLESS_WEB_OPTIONS, false);

  const config = createTuturuuuWebE2EConfig({
    tests: 'apps/web/e2e-agent/**/*.e2e.ts',
    env: { CI: '1' },
  });

  assert.equal(config.projectId, 'tuturuuu-platform');
  assert.equal(config.video, 'off');
  assert.equal(config.trace, 'retain-on-failure');
  assert.equal(config.workers, 1);
  assert.equal(config.retries, 0);
  assert.equal(config.credentials, undefined);
  assert.deepEqual(config.cache, { mode: 'read-only', dir: '.e2e/cache' });

  const withFleet = createTuturuuuWebE2EConfig({
    tests: 'apps/web/e2e-agent/**/*.e2e.ts',
    env: {
      E2E_SECRET_FLEET_EMAIL: 'fleet-test@example.invalid',
      E2E_USER_FLEET_PASSWORD: 'ephemeral-fixture-value',
    },
  });
  assert.equal(
    withFleet.credentials?.fleet?.username,
    'fleet-test@example.invalid'
  );
  assert.equal(typeof withFleet.credentials?.fleet?.password, 'function');
});

test('offline replay executor fails closed on uncached steps without calling any model', async () => {
  const verdict = await offlineReplayExecutor.runStep({
    step: {
      kind: 'act',
      index: 0,
      instruction: 'uncached step',
      params: undefined,
      secrets: [],
    },
  });

  assert.equal(verdict.status, 'failed');
  assert.equal(verdict.errorCode, 'MODEL_UNREACHABLE');
  assert.match(verdict.summary, /--strict-cache/);
});

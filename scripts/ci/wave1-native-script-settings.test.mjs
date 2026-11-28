import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { settingsExpectation } from './wave1-native-emitted-observability.mjs';
import { profiles } from './wave1-native-profile.mjs';
import { newId, setup } from './wave1-native-production-test-helper.mjs';
import { waitForScriptObservability } from './wave1-native-script-settings.mjs';
import { productionFailureMessage } from './wave1-native-upload-error.mjs';

const require = createRequire(import.meta.url);
const {
  newId: stagingNewId,
  publisher,
} = require('./wave1-native-publication-harness.cjs');

const emitsNone = async () => ({ name: 'fixture' });
function fakeClock() {
  const clock = { ms: 0, sleeps: 0 };
  clock.timing = {
    now: () => clock.ms,
    sleep: async (ms) => {
      clock.sleeps++;
      clock.ms += ms;
    },
  };
  return clock;
}
const expected = { enabled: true, head_sampling_rate: 1 };
const matching = { success: true, result: { observability: expected } };

test('the poll retries success=false and request timeouts, then accepts', async () => {
  const clock = fakeClock();
  const reads = [
    () => ({ success: false }),
    () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    },
    () => matching,
  ];
  let attempts = 0;
  await waitForScriptObservability({
    worker: 'w',
    expected,
    readSettings: async () => reads[attempts++](),
    timing: clock.timing,
  });
  assert.equal(attempts, 3);
  assert.equal(clock.ms, 10_000);
});

test('the poll stops at 12 attempts without a trailing sleep', async () => {
  const clock = fakeClock();
  await assert.rejects(
    waitForScriptObservability({
      worker: 'w',
      expected,
      readSettings: async () => {
        throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
      },
      timing: clock.timing,
    }),
    /timed out after 12 attempts .*last observed read failed \(request timeout\)\)/
  );
  assert.equal(clock.sleeps, 11);
  assert.equal(clock.ms, 55_000);
});

test('a caller abort ends the poll without another read', async () => {
  const clock = fakeClock();
  const controller = new AbortController();
  let attempts = 0;
  await assert.rejects(
    waitForScriptObservability({
      worker: 'w',
      expected,
      signal: controller.signal,
      readSettings: async () => {
        attempts++;
        controller.abort();
        throw new Error('aborted');
      },
      timing: clock.timing,
    }),
    { name: 'ScriptObservabilityError', message: /after 1 attempts/ }
  );
  assert.equal(attempts, 1);
  assert.equal(clock.sleeps, 0);
});

const persistent503 =
  /script-settings check timed out after 12 attempts \(expected enabled=true, head_sampling_rate=1; last observed read failed with HTTP 503\)\. The new version is confirmed active at 100%\./;

test('the expectation follows the emitted Build Output, not the profile default', async () => {
  const base = { appRoot: '/unused', environment: 'staging', sha: 'a' };
  // Tools declares no profile observability, so the emitted value decides.
  assert.equal(
    await settingsExpectation({
      ...base,
      app: 'tools',
      worker: 'tools',
      readWorkerConfig: emitsNone,
    }),
    null
  );
  assert.deepEqual(
    await settingsExpectation({
      ...base,
      app: 'tools',
      worker: 'tools',
      readWorkerConfig: async () => ({
        observability: { enabled: true, headSamplingRate: 0.05 },
      }),
    }),
    { enabled: true, head_sampling_rate: 0.05 }
  );
  await assert.rejects(
    settingsExpectation({
      ...base,
      app: 'mail',
      worker: 'tuturuuu-mail',
      readWorkerConfig: async () => ({
        observability: { enabled: true, headSamplingRate: 0.05 },
      }),
    }),
    {
      name: 'ObservabilityConfigError',
      message:
        /tuturuuu-mail Build Output observability differs from the app profile \(profile enabled=true, head_sampling_rate=1; emitted enabled=true, head_sampling_rate=0\.05\)\. Nothing was deployed/,
    }
  );
});

// Every wave-1 profile declares observability; an app without a declared
// value is simulated by removing Calendar's for the duration of the test.
function withoutDeclaredObservability(t, app) {
  const declared = profiles.apps[app].observability;
  delete profiles.apps[app].observability;
  t.after(() => {
    profiles.apps[app].observability = declared;
  });
}

test('staging skips the settings check when neither profile nor emitter declares observability', async (t) => {
  withoutDeclaredObservability(t, 'calendar');
  const p = await publisher(t, 'calendar');
  p.options.readWorkerConfig = emitsNone;
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(String(line)));
  await p.run();
  assert.equal(p.state.settingsReads, 0);
  assert.equal(p.state.writes, 1);
  assert.ok(logs.some((line) => /settings check is skipped/.test(line)));
  const record = JSON.parse(
    readFileSync(join(p.dir, 'calendar-staging-publication.json'), 'utf8')
  );
  assert.equal(record.state, 'activated');
});

test('staging refuses before deploy when the emitter drops a profile-declared rate', async (t) => {
  const p = await publisher(t, 'mail');
  p.options.readWorkerConfig = emitsNone;
  await assert.rejects(p.run(), {
    name: 'ObservabilityConfigError',
    message: /emitted none\)\. Nothing was deployed/,
  });
  assert.equal(p.state.writes, 0);
  assert.equal(p.state.ledgerWrites, 0);
  assert.equal(p.state.settingsReads, 0);
});

test('staging retries a failed settings read inside the bound', async (t) => {
  const p = await publisher(t, 'mail');
  p.state.settingsErrorReads = 1;
  await p.run();
  assert.equal(p.state.settingsReads, 2);
  assert.equal(p.state.settingsWaitMs, 5_000);
  assert.equal(p.state.active, stagingNewId);
});

test('staging reports a persistent settings read failure as a settings incident', async (t) => {
  const p = await publisher(t, 'mail');
  p.state.settingsErrorReads = Infinity;
  await assert.rejects(p.run(), {
    name: 'ScriptObservabilityError',
    message: persistent503,
  });
  assert.equal(p.state.settingsReads, 12);
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.active, stagingNewId);
});

test('production retries a failed settings read inside the bound', async (t) => {
  const p = setup(t, { app: 'mail' });
  p.state.settingsErrorReads = 1;
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.settingsReads, 2);
  assert.equal(p.state.settingsWaitMs, 5_000);
});

test('production classifies a persistent settings read failure as post-activation', async (t) => {
  const p = setup(t, { app: 'mail' });
  p.state.settingsErrorReads = Infinity;
  await assert.rejects(p.run(), (error) => {
    const message = productionFailureMessage(error);
    assert.match(message, persistent503);
    assert.doesNotMatch(message, /upload refused or uncertain/);
    return true;
  });
  assert.equal(p.state.settingsReads, 12);
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.active, newId);
});

test('production refuses before upload when the emitter drops a profile-declared rate', async (t) => {
  const p = setup(t, { app: 'mail' });
  await assert.rejects(p.run({ readWorkerConfig: emitsNone }), (error) => {
    assert.match(productionFailureMessage(error), /Nothing was deployed/);
    return true;
  });
  assert.equal(p.state.writes, 0);
  assert.deepEqual(p.state.calls, []);
});

test('production skips the settings check when neither profile nor emitter declares observability', async (t) => {
  withoutDeclaredObservability(t, 'calendar');
  const p = setup(t);
  t.mock.method(console, 'log', () => {});
  const result = await p.run({ readWorkerConfig: emitsNone });
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.settingsReads, 0);
  assert.equal(p.state.writes, 1);
});

test('a wave-1 production publish refuses when its emitter declares no observability', async (t) => {
  for (const app of ['calendar', 'apps', 'finance', 'drive']) {
    const p = setup(t, { app });
    await assert.rejects(
      p.run({ readWorkerConfig: emitsNone }),
      (error) => {
        assert.match(productionFailureMessage(error), /Nothing was deployed/);
        return true;
      },
      app
    );
    assert.equal(p.state.writes, 0, app);
  }
});

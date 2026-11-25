// Every wave-1 Worker samples every request, so a publish never lowers live
// Workers Logs sampling. The profile value must reach the sealed config and
// the emitted Build Output that the settings readback checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { prepare, verify } from './wave1-native-artifact.mjs';
import { settingsExpectation } from './wave1-native-emitted-observability.mjs';
import { observabilityFor, profiles } from './wave1-native-profile.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
const sha = 'a'.repeat(40);
const wave1 = ['mail', 'calendar', 'apps', 'finance', 'drive'];
const full = { enabled: true, head_sampling_rate: 1 };

test('every wave-1 profile pins head_sampling_rate to 1', () => {
  for (const app of wave1) {
    assert.deepEqual(profiles.apps[app].observability, full, app);
    assert.deepEqual(observabilityFor(app), full, app);
  }
});

test('profiles outside wave 1 keep their default sampling', () => {
  for (const app of Object.keys(profiles.apps)) {
    if (wave1.includes(app)) continue;
    assert.equal(profiles.apps[app].observability, undefined, app);
    assert.deepEqual(
      observabilityFor(app),
      { enabled: true, head_sampling_rate: 0.05 },
      app
    );
  }
});

for (const app of wave1)
  test(`${app} production seal and emitted Build Output carry full sampling`, async (t) => {
    const root = fixture(t, app);
    prepare(root, app, 'production', undefined, sha);
    const sealed = JSON.parse(
      readFileSync(verify(root, app, 'production', sha).config, 'utf8')
    );
    assert.deepEqual(sealed.observability, full);
    // The same expectation the post-activation settings readback enforces.
    assert.deepEqual(
      await settingsExpectation({
        app,
        appRoot: root,
        environment: 'production',
        sha,
        worker: sealed.name,
      }),
      full
    );
  });

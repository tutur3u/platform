// Staged production publication end to end against fakes: version-only
// upload, 0% stage, override smoke, switch, health gate and rollback.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  newId,
  oldId,
  setup,
  sha,
} from './wave1-native-production-test-helper.mjs';

const serving = [{ version_id: oldId, percentage: 100 }];
const stage = [
  { version_id: oldId, percentage: 100 },
  { version_id: newId, percentage: 0 },
];
const switched = [{ version_id: newId, percentage: 100 }];

function receipt(p) {
  return JSON.parse(
    readFileSync(
      join(p.env.RUNNER_TEMP, 'calendar-production-publication.json'),
      'utf8'
    )
  );
}

test('a healthy release stages, smokes, switches and passes the health gate', async (t) => {
  const p = setup(t);
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.deepEqual(p.state.deploymentWrites, [stage, switched]);
  assert.equal(result.smoke.passed, true);
  assert.equal(result.health.healthy, true);
  assert.equal(p.state.writes, 1);
  // The smoke reached the staged version through the override header, signed out.
  const smoked = p.state.publicCalls.filter(
    ({ options }) => options.headers['Cloudflare-Workers-Version-Overrides']
  );
  assert.ok(smoked.length > 0);
  for (const { options } of smoked)
    assert.equal(
      options.headers['Cloudflare-Workers-Version-Overrides'],
      `tuturuuu-calendar="${newId}"`
    );
});

test('a failed staged smoke restores serving before any traffic moves', async (t) => {
  const p = setup(t);
  p.state.publicStatus[newId] = 500;
  await assert.rejects(p.run(), /Staged smoke failed.*no traffic moved/);
  assert.deepEqual(p.state.deploymentWrites, [stage, serving]);
  assert.equal(p.state.active, oldId);
  assert.equal(receipt(p).state, 'smoke-failed');
});

test('an override that never reaches the staged version fails closed', async (t) => {
  const p = setup(t);
  p.state.overrideReaches = false;
  await assert.rejects(p.run(), /never reached staged version/);
  assert.deepEqual(p.state.deploymentWrites, [stage, serving]);
  assert.equal(receipt(p).smoke.passed, false);
});

for (const [name, mutate, message] of [
  [
    '5xx after the switch',
    (state) => {
      state.unstagedStatus[newId] = 503;
    },
    /answered 503/,
  ],
  [
    'a timeout after the switch',
    (state) => {
      state.unstagedStatus[newId] = 'timeout';
    },
    /timeout/,
  ],
  [
    'a wrong commit after the switch',
    (state) => {
      state.unstagedCommit = 'd'.repeat(40);
    },
    /reports d{40}, expected a{40}/,
  ],
]) {
  test(`${name} fails the job and rolls back to the recorded deployment`, async (t) => {
    const p = setup(t);
    mutate(p.state);
    await assert.rejects(p.run(), (error) => {
      assert.match(error.message, /health gate failed/);
      assert.match(error.message, message);
      assert.match(error.message, /rolled back to deployment/);
      return true;
    });
    assert.deepEqual(p.state.deploymentWrites, [stage, switched, serving]);
    assert.equal(p.state.active, oldId);
    const record = receipt(p);
    assert.equal(record.state, 'rolled-back');
    assert.equal(record.health.healthy, false);
    assert.equal(record.rollbackResult.state, 'restored');
    // The restored version is probed again and recorded.
    assert.equal(record.rollbackHealth.healthy, true);
  });
}

test('a rollback that cannot be confirmed fails loudly and marks the receipt uncertain', async (t) => {
  const p = setup(t);
  p.state.unstagedStatus[newId] = 500;
  p.state.failDeploymentWrite = (_versions, count) => count >= 3;
  await assert.rejects(
    p.run(),
    /rollback to deployment .* FAILED; receipt marked uncertain/
  );
  const record = receipt(p);
  assert.equal(record.state, 'uncertain');
  assert.equal(record.rollbackResult.state, 'failed');
});

test('a refusal before upload never stages or rolls back', async (t) => {
  const p = setup(t);
  p.state.attached = true;
  p.state.attachedHostname = 'calendar.tuturuuu.com';
  await assert.rejects(p.run(), /Custom Domain/);
  assert.equal(p.state.writes, 0);
  assert.deepEqual(p.state.deploymentWrites, []);
});

test('a failed upload never stages or rolls back', async (t) => {
  const p = setup(t);
  p.state.uncertain = true;
  await assert.rejects(p.run());
  assert.deepEqual(p.state.deploymentWrites, []);
  assert.equal(receipt(p).state, 'pending');
});

test('Calendar publishes behind its reviewed Custom Domain through the staged mode', async (t) => {
  const p = setup(t);
  p.state.servingTopology = {
    reason: 'fixture',
    customDomains: ['calendar.tuturuuu.com'],
    routes: [],
  };
  p.state.attached = true;
  p.state.attachedHostname = 'calendar.tuturuuu.com';
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.deepEqual(p.state.deploymentWrites, [stage, switched]);
});

test('a reconciled version is neither staged nor rolled back', async (t) => {
  const p = setup(t);
  p.state.ids = [newId];
  p.state.active = newId;
  p.state.prior = true;
  const result = await p.run();
  assert.equal(result.reconciled, true);
  assert.deepEqual(p.state.deploymentWrites, []);
});

test('build-info answered by another app never passes the smoke', async (t) => {
  const p = setup(t);
  p.state.buildInfoApp = 'gateway';
  await assert.rejects(p.run(), /reports app gateway, expected calendar/);
  assert.deepEqual(p.state.deploymentWrites, [stage, serving]);
});

test('the Calendar artifact publisher refuses in preflight, before any state', async (t) => {
  const p = setup(t);
  writeFileSync(join(p.appRoot, 'calendar-artifact.json'), '{}');
  await assert.rejects(p.run(), /cannot upload a version without traffic/);
  assert.equal(p.state.writes, 0);
  assert.deepEqual(p.state.deploymentWrites, []);
  assert.deepEqual(p.state.calls, []);
});

test('the preflight records the proven serving SHA in the receipt', async (t) => {
  const p = setup(t);
  p.state.publicStatus[newId] = 500;
  await assert.rejects(p.run(), /Staged smoke failed/);
  const record = receipt(p);
  assert.equal(record.state, 'smoke-failed');
  assert.equal(record.servingSha, 'e'.repeat(40));
});

for (const budget of ['abc', '0', '-5', '1.5', '1e6', '9999999999'])
  test(`a malformed upload budget ${budget} refuses before any write`, async (t) => {
    const p = setup(t);
    await assert.rejects(
      p.run({ env: { ...p.env, WAVE1_UPLOAD_BUDGET_MS: budget } }),
      /WAVE1_UPLOAD_BUDGET_MS must be a positive whole number/
    );
    assert.equal(p.state.writes, 0);
    assert.deepEqual(p.state.deploymentWrites, []);
  });

test('a valid upload budget is accepted', async (t) => {
  const p = setup(t);
  const result = await p.run({
    env: { ...p.env, WAVE1_UPLOAD_BUDGET_MS: '600000' },
  });
  assert.equal(result.state, 'accepted-private');
});

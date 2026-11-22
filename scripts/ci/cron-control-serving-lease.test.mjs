import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renewServingLease } from '../../apps/cron-control/scripts/verify-already-serving.mjs';

const DEPLOYMENT = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-000000000002';

function leaseFixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'cron-control-lease-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const origin = 'https://coordinator.example.test';
  const stateFile = join(folder, 'lease.json');
  const now = Date.parse('2026-11-22T11:00:00Z');
  const grant = {
    jobId: DEPLOYMENT,
    attemptId: VERSION,
    workerId: '42:1:deploy',
    epoch: 2,
    leaseDeadline: new Date(now - 1).toISOString(),
  };
  writeFileSync(
    stateFile,
    JSON.stringify({
      deploymentId: DEPLOYMENT,
      base: origin,
      grant,
    })
  );
  const env = {
    DC_STATE_FILE: stateFile,
    DEPLOY_COORDINATOR_ORIGIN: origin,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-oidc-request',
    CRON_COORDINATOR_CHECK: 'success',
    CRON_COORDINATOR_DEPLOYMENT_ID: DEPLOYMENT,
    GITHUB_RUN_ID: '42',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_JOB: 'deploy',
  };
  const renewed = {
    ...grant,
    leaseDeadline: new Date(now + 60_000).toISOString(),
  };
  const calls = [];
  const fixture = {
    env,
    grant,
    renewed,
    calls,
    status: 200,
    now,
    deps: {
      now: () => fixture.now,
      sleep: async () => {},
      async fetchImpl(url, init) {
        calls.push({ url, method: init.method });
        assert.equal(init.redirect, 'error');
        if (init.method === 'GET') return Response.json({ value: 'mock-oidc' });
        assert.equal(
          url,
          `${origin}/v1/projects/cron-control/environments/production/deployments/${DEPLOYMENT}/heartbeat`
        );
        assert.deepEqual(JSON.parse(init.body), {
          grant: { attemptId: VERSION, epoch: grant.epoch },
        });
        return Response.json(renewed, { status: fixture.status });
      },
    },
  };
  return fixture;
}

test('proof accepts an authoritative renewal past the original disk deadline', async (t) => {
  const state = leaseFixture(t);
  const verify = await renewServingLease(state.env, state.deps);
  assert.deepEqual(
    state.calls.map(({ method }) => method),
    ['GET', 'POST']
  );
  verify();
  state.now += 60_000;
  assert.throws(verify, /expired or was fenced/);
});

test('proof refuses a failed authoritative heartbeat', async (t) => {
  const state = leaseFixture(t);
  state.status = 409;
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /did not renew the exact lease/
  );
  assert.deepEqual(
    state.calls.map(({ method }) => method),
    ['GET', 'POST']
  );
});

test('proof refuses a mismatched or expired authoritative grant', async (t) => {
  const state = leaseFixture(t);
  state.renewed.epoch += 1;
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /did not renew the exact lease/
  );
  state.renewed.epoch = state.grant.epoch;
  state.renewed.leaseDeadline = new Date(state.now).toISOString();
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /expired or was fenced/
  );
});

test('a job without a coordinator registration reports no lease and never contacts the coordinator', async (t) => {
  const state = leaseFixture(t);
  delete state.env.CRON_COORDINATOR_DEPLOYMENT_ID;
  state.env.CRON_COORDINATOR_CHECK = 'skipped';
  state.env.CRON_COORDINATOR_MODE = '';
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /registered no lease \(DEPLOY_COORDINATOR_MODE="unset" must be observe or enforce/
  );
  assert.deepEqual(state.calls, []);
});

test('a registered job whose lease check did not succeed stops before renewal', async (t) => {
  const state = leaseFixture(t);
  state.env.CRON_COORDINATOR_CHECK = 'skipped';
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /successful coordinator lease check \(outcome: skipped\)/
  );
  assert.deepEqual(state.calls, []);
});

test('a fenced lease stops before renewal and fails closed', async (t) => {
  const state = leaseFixture(t);
  writeFileSync(`${state.env.DC_STATE_FILE}.fenced`, '');
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /unfenced coordinator lease: the coordinator fenced this job/
  );
  assert.deepEqual(state.calls, []);
});

test('an unfenced registered lease proceeds to renewal', async (t) => {
  const state = leaseFixture(t);
  await renewServingLease(state.env, state.deps);
  assert.deepEqual(
    state.calls.map(({ method }) => method),
    ['GET', 'POST']
  );
});

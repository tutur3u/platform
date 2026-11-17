import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cfQueueJob,
  cfPhaseKey,
  payloadDigest,
  runCfPhase,
  stopCfJob,
  submitCfJob,
} from './release-cf-queue.mjs';
const record = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
).apps.finance.releaseRecipe;
const account = 'a'.repeat(32);
const grant = {
  jobId: 'job-1',
  attemptId: 'attempt-1',
  workerId: 'approved-worker',
  epoch: 1,
  leaseDeadline: 'authority-confirmed',
  targetLockId: 'canonical-lock',
  stopRevision: 0,
};
const input = () => ({
  operationId: 'release-1',
  repository: 'example/platform',
  sourceSha: 'a'.repeat(40),
  recipeSha256: 'b'.repeat(64),
  configSha256: payloadDigest(record),
  requestedPhases: ['publish'],
  artifact: { id: 'sealed-artifact', sha256: 'c'.repeat(64) },
  requirements: {
    os: 'darwin',
    arch: 'arm64',
    toolchain: 'pinned',
    capabilities: ['approved-deploy'],
    cpu: 1,
    ramMiB: 1024,
    diskMiB: 1024,
    maxDurationMs: 60000,
    maxInfrastructureRetries: 0,
  },
  authorizationRefs: ['approval-record'],
  rollback: null,
  provenance: { actor: 'release-owner', owningThread: 'recipe-owner' },
  checkpointRef: null,
});
function authority(
  state = {
    jobs: new Map(),
    receipts: new Map(),
    revision: 0,
    epoch: 1,
    intents: new Set(),
  }
) {
  return {
    state,
    async submit(payload) {
      const digest = payloadDigest(payload);
      const prior = state.jobs.get(payload.operationId);
      assert.ok(!prior || prior.digest === digest, 'Operation conflict');
      const result = prior ?? { jobId: 'job-1', digest };
      state.jobs.set(payload.operationId, result);
      return result;
    },
    async requestStop(jobId, expectedRevision) {
      assert.equal(expectedRevision, state.revision);
      state.revision++;
      return { jobId, stopRevision: state.revision };
    },
    async beginPhase({ grant: current, phaseKey }) {
      assert.equal(current.epoch, state.epoch);
      assert.equal(current.stopRevision, state.revision);
      assert.ok(!state.offline && !state.refused);
      const receipt = state.receipts.get(phaseKey);
      assert.ok(
        receipt || !state.intents.has(phaseKey),
        'Original intent requires reconciliation'
      );
      if (!receipt) state.intents.add(phaseKey);
      return { grant: { ...current }, receipt };
    },
    async renew(current) {
      assert.ok(!state.offline);
      assert.equal(current.epoch, state.epoch);
      assert.equal(current.stopRevision, state.revision);
      return { ...current };
    },
    async checkpoint({ phaseKey, receipt }) {
      assert.ok(!state.offline);
      state.receipts.set(phaseKey, structuredClone(receipt));
      return structuredClone(receipt);
    },
  };
}
const successful = async () => ({
  providerOperationId: 'recorded-version',
  verificationRefs: ['readback-sha256'],
});
const job = () => cfQueueJob(structuredClone(record), account, input());
const run = (port, execute = successful, payload = job(), current = grant) =>
  runCfPhase({
    authority: port,
    payload,
    grant: current,
    phase: payload.requestedPhases[0],
    execute,
  });

test('queue payload derives its canonical target from reviewed config', () => {
  const payload = job();
  assert.deepEqual(payload.target, {
    provider: 'cloudflare',
    account,
    project: record.cf.productionWorker,
    app: 'finance',
    environment: 'production',
  });
  assert.equal(payload.jobType, 'cf-wave1');
});
test('duplicate submit retains original job; changed payload conflicts', async () => {
  const port = authority();
  const payload = job();
  assert.deepEqual(
    await submitCfJob(port, payload),
    await submitCfJob(port, payload)
  );
  await assert.rejects(
    submitCfJob(port, { ...payload, sourceSha: 'd'.repeat(40) }),
    /conflict/i
  );
});
test('submission fails closed without authority', async () => {
  await assert.rejects(submitCfJob(null, job()), /authority unavailable/i);
});
test('phase succeeds only with post-effect fence confirmation and readback', async () => {
  const result = await run(authority());
  assert.equal(result.status, 'succeeded');
  assert.equal(result.guardCode, 'PHASE_VERIFIED');
  assert.equal(result.providerOperationId, 'recorded-version');
});
test('completed durable receipt survives restart without another effect', async () => {
  const first = authority();
  const expected = await run(first);
  let calls = 0;
  const second = authority(first.state);
  assert.deepEqual(
    await run(second, async () => {
      calls++;
      return successful();
    }),
    expected
  );
  assert.equal(calls, 0);
});
for (const [label, change] of [
  [
    'stale epoch',
    (state) => {
      state.epoch = 2;
    },
  ],
  [
    'stop before effect',
    (state) => {
      state.revision = 1;
    },
  ],
  [
    'unavailable authority',
    (state) => {
      state.offline = true;
    },
  ],
  [
    'missing or expired approval',
    (state) => {
      state.refused = 'approval';
    },
  ],
  [
    'target alias contention',
    (state) => {
      state.refused = 'target-lock';
    },
  ],
  [
    'ineligible secretless worker',
    (state) => {
      state.refused = 'worker';
    },
  ],
])
  test(`${label} prevents executor invocation`, async () => {
    const port = authority();
    change(port.state);
    let calls = 0;
    const result = await run(port, async () => {
      calls++;
      return successful();
    });
    assert.equal(result.status, 'stopped');
    assert.equal(calls, 0);
    assert.equal(result.guardPhase, 'publish');
  });
for (const [label, change] of [
  [
    'stop during provider call',
    (state) => {
      state.revision++;
    },
  ],
  [
    'offline after provider acceptance',
    (state) => {
      state.offline = true;
    },
  ],
  [
    'epoch changes during provider call',
    (state) => {
      state.epoch++;
    },
  ],
])
  test(`${label} requires reconciliation`, async () => {
    const port = authority();
    let calls = 0;
    const result = await run(port, async () => {
      calls++;
      change(port.state);
      return successful();
    });
    assert.equal(calls, 1);
    assert.equal(result.status, 'unknown');
    assert.equal(result.guardCode, 'RECONCILIATION_REQUIRED');
    assert.equal(result.providerOperationId, 'recorded-version');
  });
test('UNKNOWN receipt blocks replay until explicit readback reconciliation', async () => {
  const port = authority();
  const payload = job();
  let calls = 0;
  const result = await run(
    port,
    async () => {
      calls++;
      throw new Error('transport lost');
    },
    payload
  );
  assert.equal(result.status, 'unknown');
  assert.equal(
    (
      await run(
        port,
        async () => {
          calls++;
          return successful();
        },
        payload
      )
    ).status,
    'unknown'
  );
  const key = cfPhaseKey(payload, 'publish');
  port.state.receipts.set(key, {
    ...result,
    status: 'succeeded',
    guardCode: 'PHASE_VERIFIED',
    verificationRefs: ['original-operation-readback'],
  });
  assert.equal((await run(port, successful, payload)).status, 'succeeded');
  assert.equal(calls, 1);
});
test('immutable artifact mismatch refuses old receipt before effect', async () => {
  const port = authority();
  const original = await run(port);
  const payload = job();
  payload.artifact.sha256 = 'd'.repeat(64);
  port.state.receipts.set(cfPhaseKey(payload, 'publish'), original);
  let calls = 0;
  assert.equal(
    (
      await run(
        port,
        async () => {
          calls++;
          return successful();
        },
        payload
      )
    ).status,
    'stopped'
  );
  assert.equal(calls, 0);
});
test('durable cancellation CAS remains across restarted adapter', async () => {
  const first = authority();
  await stopCfJob(first, 'job-1', 0);
  const second = authority(first.state);
  let calls = 0;
  assert.equal(
    (
      await run(second, async () => {
        calls++;
        return successful();
      })
    ).status,
    'stopped'
  );
  assert.equal(calls, 0);
  await assert.rejects(stopCfJob(second, 'job-1', 0));
});
test('rollback requires a separately authorized recorded preimage', async () => {
  const values = input();
  values.requestedPhases = ['rollback'];
  assert.throws(() => cfQueueJob(structuredClone(record), account, values));
  values.rollback = {
    deploymentId: 'known-good',
    authorizationRef: 'rollback-approval',
    scope: 'recorded-preimage',
  };
  const payload = cfQueueJob(structuredClone(record), account, values);
  const result = await run(
    authority(),
    async () => ({ ...(await successful()), deploymentId: 'known-good' }),
    payload
  );
  assert.equal(result.phase, 'rollback');
  assert.equal(result.status, 'succeeded');
  assert.equal((await run(authority(), successful, payload)).status, 'unknown');
});
test('unbounded retries, changed config, unknown input and promote are refused', () => {
  for (const change of [
    (values) => {
      values.requirements.maxInfrastructureRetries = 99;
    },
    (values) => {
      values.configSha256 = 'd'.repeat(64);
    },
    (values) => {
      values.token = 'redacted';
    },
    (values) => {
      values.requestedPhases = ['promote'];
    },
  ]) {
    const values = input();
    change(values);
    assert.throws(() => cfQueueJob(structuredClone(record), account, values));
  }
});

test('offline acceptance intent survives authority recovery without replay', async () => {
  const first = authority();
  let calls = 0;
  const result = await run(first, async () => {
    calls++;
    first.state.offline = true;
    return successful();
  });
  assert.equal(result.status, 'unknown');
  first.state.offline = false;
  const resumed = authority(first.state);
  assert.equal(
    (
      await run(resumed, async () => {
        calls++;
        return successful();
      })
    ).status,
    'stopped'
  );
  assert.equal(calls, 1);
});

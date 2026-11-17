import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cfQueueJob,
  recipeDigest,
  RecipeFailure,
  cfPhaseKey,
  payloadDigest,
  runCfPhase,
  stopCfJob,
  submitCfJob,
} from './release-cf-queue.mjs';
import {
  record,
  account,
  grant,
  input,
  authority,
  successful,
  job,
  run,
} from './release-cf-queue-test-helper.mjs';
test('queue payload derives its canonical target from reviewed config', () => {
  const payload = job();
  assert.deepEqual(payload.target, {
    provider: 'cloudflare',
    account,
    project: record.cf.productionWorker,
    app: 'finance',
    environment: 'production',
    aliases: [record.cf.productionWorker, ...record.canonicalHosts].sort(),
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
      state.approvalExpired = true;
    },
  ],
  [
    'target alias contention',
    (state) => {
      state.lockOwnedByOther = true;
    },
  ],
  [
    'ineligible secretless worker',
    (state) => {
      state.workerSecretless = true;
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
    assert.ok(['failed', 'unknown'].includes(result.status));
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
    'unknown'
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
    'unknown'
  );
  assert.equal(calls, 0);
  await assert.rejects(stopCfJob(second, 'job-1', 0));
});
test('rollback requires a separately authorized recorded preimage', async () => {
  const values = input();
  values.requestedPhases = ['rollback'];
  assert.throws(() => cfQueueJob(structuredClone(record), values));
  values.rollback = {
    deploymentId: 'known-good',
    authorizationRef: 'rollback-approval',
    scope: 'recorded-preimage',
  };
  const payload = cfQueueJob(structuredClone(record), values);
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
    assert.throws(() => cfQueueJob(structuredClone(record), values));
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
    'unknown'
  );
  assert.equal(calls, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeVercelPhase,
  aliasLockKey,
  payloadDigest,
  requestVercelStop,
  submitVercelRelease,
} from './release-vercel-queue.mjs';
const target = {
  provider: 'vercel',
  account: 'fixture',
  project: 'calendar',
  app: 'calendar',
  environment: 'vercel-stage-calendar',
  alias: 'calendar.tuturuuu.com',
};
const payload = () => ({
  schemaVersion: 1,
  operationId: 'release-1',
  jobType: 'vercel-release',
  repository: 'tutur3u/platform',
  sourceSha: 'a'.repeat(40),
  recipeSha256: 'b'.repeat(64),
  configSha256: 'c'.repeat(64),
  target: structuredClone(target),
  requestedPhases: ['stage'],
  requirements: {
    os: 'darwin',
    arch: 'arm64',
    toolchain: 'node24',
    capabilities: ['offline'],
    cpu: 1,
    ramMiB: 512,
    diskMiB: 512,
    maxDurationMs: 1000,
    infrastructureRetryLimit: 0,
  },
  authorizationRefs: ['security:fixture'],
  rollback: {
    deploymentId: 'dpl_preimage',
    authorizationRef: 'rollback:fixture',
  },
  provenance: { actor: 'fixture', thread: 'fixture-thread' },
});
function authority() {
  const state = {
    jobs: new Map(),
    receipts: [],
    epoch: 1,
    stopRevision: 0,
    approval: true,
    locked: false,
    status: 'running',
  };
  const grant = () => ({
    jobId: 'job-1',
    attemptId: 'attempt-1',
    workerId: 'worker-1',
    epoch: state.epoch,
    targetLockId: 'lock-1',
    aliasLockKey: aliasLockKey(target),
    stopRevision: state.stopRevision,
    leaseDeadline: 200,
    authorityNow: 100,
  });
  return {
    state,
    async submit(value) {
      const old = state.jobs.get(value.operationId);
      if (old && old !== payloadDigest(value))
        throw Object.assign(new Error('payload conflict'), {
          code: 'CONFLICT',
        });
      state.jobs.set(value.operationId, payloadDigest(value));
      return { jobId: 'job-1', status: 'queued' };
    },
    async claim() {
      return grant();
    },
    async renew() {
      return grant();
    },
    async beginPhase() {
      if (!state.approval || state.locked) return { status: 'refused' };
      return { status: state.status, receipt: state.receipts.at(-1) };
    },
    async checkpoint(_grant, receipt) {
      state.receipts.push(receipt);
      return { status: 'running' };
    },
    async finish() {
      state.status = 'succeeded';
      return { status: 'succeeded' };
    },
    async requestStop(_job, expected) {
      assert.equal(expected, state.stopRevision);
      return { stopRevision: ++state.stopRevision };
    },
  };
}
const run = (port, execute, value = payload()) =>
  executeVercelPhase({
    port,
    execute,
    payload: value,
    reviewedTarget: target,
    host: 'offline-studio',
  });

test('missing authority fails closed without provider fallback', async () => {
  await assert.rejects(submitVercelRelease(null, payload(), target), {
    guardCode: 'QUEUE_AUTHORITY_UNAVAILABLE',
  });
});
test('duplicate submit is stable; changed payload conflicts at authority', async () => {
  const port = authority();
  assert.deepEqual(
    await submitVercelRelease(port, payload(), target),
    await submitVercelRelease(port, payload(), target)
  );
  await assert.rejects(
    submitVercelRelease(
      port,
      { ...payload(), sourceSha: 'd'.repeat(40) },
      target
    ),
    { guardCode: 'QUEUE_CONFLICT' }
  );
});
test('no stage to promote chaining or unreviewed target', async () => {
  for (const value of [
    { ...payload(), requestedPhases: ['stage', 'promote'] },
    { ...payload(), target: { ...target, project: 'other' } },
  ])
    await assert.rejects(submitVercelRelease(authority(), value, target), {
      guardCode: 'QUEUE_PAYLOAD_INVALID',
    });
});
test('stale epoch and durable stop prevent effects', async () => {
  for (const key of ['epoch', 'stopRevision']) {
    const port = authority();
    let effects = 0;
    const result = await run(port, async (ctx) => {
      port.state[key]++;
      await ctx.effect('mutation', async () => effects++);
    });
    assert.equal(result.status, 'stopped');
    assert.equal(effects, 0);
  }
});
test('stop during effect is UNKNOWN and never retried', async () => {
  const port = authority();
  let effects = 0;
  const result = await run(port, async (ctx) =>
    ctx.effect('mutation', async () => {
      effects++;
      await requestVercelStop(port, 'job-1', 0);
      return 'accepted';
    })
  );
  assert.equal(result.status, 'unknown');
  assert.equal(effects, 1);
  assert.equal(result.guardCode, 'QUEUE_EFFECT_UNKNOWN');
});
test('offline after provider acceptance retains UNKNOWN', async () => {
  const port = authority();
  let effects = 0;
  const result = await run(port, async (ctx) =>
    ctx.effect('mutation', async () => {
      effects++;
      port.renew = async () => {
        throw new Error('offline');
      };
      return 'accepted';
    })
  );
  assert.equal(result.status, 'unknown');
  assert.equal(effects, 1);
});
test('unknown receipt blocks replay until authority reconciles readback', async () => {
  const port = authority();
  port.state.status = 'unknown';
  let effects = 0;
  await assert.rejects(
    run(port, async () => effects++),
    { guardCode: 'QUEUE_PHASE_UNKNOWN' }
  );
  assert.equal(effects, 0);
  port.state.status = 'succeeded';
  port.state.receipts.push({
    operationId: 'release-1',
    phase: 'stage',
    sourceSha: payload().sourceSha,
    configSha256: payload().configSha256,
    recipeSha256: payload().recipeSha256,
    canonicalTarget: target,
    status: 'succeeded',
    evidence: { deploymentId: 'dpl_verified' },
  });
  assert.equal(
    (await run(port, async () => effects++)).evidence.deploymentId,
    'dpl_verified'
  );
  assert.equal(effects, 0);
});
test('missing or expired approval and alias contention prevent execution', async () => {
  for (const [key, value] of [
    ['approval', false],
    ['locked', true],
  ]) {
    const port = authority();
    port.state[key] = value;
    let calls = 0;
    await assert.rejects(
      run(port, async () => calls++),
      { guardCode: 'QUEUE_GRANT_INVALID' }
    );
    assert.equal(calls, 0);
  }
});
test('immutable resume artifact required and rollback scope retained', async () => {
  const value = { ...payload(), requestedPhases: ['rollback'] };
  await assert.rejects(submitVercelRelease(authority(), value, target), {
    guardCode: 'QUEUE_PAYLOAD_INVALID',
  });
  value.artifact = { id: 'dpl_candidate', sha256: 'd'.repeat(64) };
  const port = authority();
  await submitVercelRelease(port, value, target);
  assert.equal(value.rollback.deploymentId, 'dpl_preimage');
});
test('restart returns durable completed receipt without another effect', async () => {
  const port = authority();
  let effects = 0;
  const first = await run(port, async (ctx) => {
    await ctx.effect('mutation', async () => effects++);
    return { deploymentId: 'dpl_result' };
  });
  const second = await run(port, async () => effects++);
  assert.deepEqual(second, first);
  assert.equal(effects, 1);
});

test('phase receipts retain timestamps and provider identity without raw exceptions', async () => {
  const result = await run(authority(), async () => ({
    deploymentId: 'dpl_result',
  }));
  assert.ok(Number.isFinite(Date.parse(result.startedAt)));
  assert.ok(Date.parse(result.finishedAt) >= Date.parse(result.startedAt));
  assert.equal(result.providerOperationId, 'dpl_result');
  const refused = await run(authority(), async () => {
    throw new Error('private details');
  });
  assert.equal(refused.guardCode, 'QUEUE_EXECUTION_FAILED');
  assert.equal(JSON.stringify(refused).includes('private details'), false);
});

test('closed payload refuses unknown and secret-shaped fields at every boundary', async () => {
  for (const alter of [
    (p) => {
      p.secrets = { VERCEL_TOKEN: 'fixture' };
    },
    (p) => {
      p.token = 'fixture';
    },
    (p) => {
      p.requirements.env = {};
    },
    (p) => {
      p.rollback.secrets = {};
    },
    (p) => {
      p.provenance.apiKey = 'fixture';
    },
    (p) => {
      p.artifact = { id: 'fixture', sha256: 'a'.repeat(64), secret: 'fixture' };
    },
  ]) {
    const p = payload();
    alter(p);
    await assert.rejects(submitVercelRelease(authority(), p, target), {
      guardCode: 'QUEUE_PAYLOAD_INVALID',
    });
  }
});
test('throwing authority transports carry fixed guard identity', async () => {
  const port = authority();
  port.submit = async () => {
    throw new Error('offline');
  };
  await assert.rejects(submitVercelRelease(port, payload(), target), {
    guardCode: 'QUEUE_AUTHORITY_UNAVAILABLE',
    guardPhase: 'submit',
  });
  port.claim = async () => {
    throw new Error('offline');
  };
  await assert.rejects(
    run(port, async () => {}),
    { guardCode: 'QUEUE_AUTHORITY_UNAVAILABLE', guardPhase: 'stage' }
  );
  port.requestStop = async () => {
    throw new Error('offline');
  };
  await assert.rejects(requestVercelStop(port, 'job-1', 0), {
    guardCode: 'QUEUE_AUTHORITY_UNAVAILABLE',
    guardPhase: 'stop',
  });
});
test('refused final acknowledgements and forged replay never report success', async () => {
  for (const name of ['checkpoint', 'finish']) {
    const port = authority();
    const original = port[name];
    port[name] = async (...args) =>
      args[1]?.status === 'intent' ? original(...args) : { status: 'refused' };
    const result = await run(port, async (ctx) =>
      ctx.effect('mutation', async () => ({ deploymentId: 'dpl_result' }))
    );
    assert.equal(result.status, 'unknown');
  }
  const port = authority();
  port.state.status = 'succeeded';
  port.state.receipts.push({ status: 'succeeded', operationId: 'wrong' });
  await assert.rejects(
    run(port, async () => {}),
    { guardCode: 'QUEUE_GRANT_INVALID' }
  );
});
test('alias lock covers the shared resource across stage and production', () => {
  assert.equal(
    aliasLockKey(target),
    aliasLockKey({ ...target, environment: 'vercel-production-calendar' })
  );
  assert.notEqual(
    aliasLockKey(target),
    aliasLockKey({ ...target, alias: 'other.tuturuuu.com' })
  );
});

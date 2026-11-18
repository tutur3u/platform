import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  executeVercelPhase,
  QueueStop,
  QUEUE_GUARD_PHASES,
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
    jobId: 'job-1',
    attemptId: 'attempt-1',
    epoch: 1,
    guardCode: null,
    guardPhase: 'stage',
    evidenceSha256: payloadDigest({ deploymentId: 'dpl_verified' }),
    providerOperationId: 'dpl_verified',
    operationId: 'release-1',
    artifactSha256: null,
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

test('checkpoint references and array extras cannot carry secret fields', async () => {
  for (const alter of [
    (p) => {
      p.checkpointRef = { secrets: 'fixture' };
    },
    (p) => {
      p.requirements.capabilities.TOKEN = 'fixture';
    },
  ]) {
    const p = payload();
    alter(p);
    await assert.rejects(submitVercelRelease(authority(), p, target), {
      guardCode: 'QUEUE_PAYLOAD_INVALID',
    });
  }
});

test('intent checkpoint transport errors retain authority-unavailable identity', async () => {
  const port = authority();
  port.checkpoint = async () => {
    throw new Error('offline');
  };
  const r = await run(port, async (ctx) =>
    ctx.effect('mutation', async () => {
      throw new Error('unreachable');
    })
  );
  assert.equal(r.guardCode, 'QUEUE_AUTHORITY_UNAVAILABLE');
  assert.equal(r.status, 'failed');
});
test('finish refusal does not append a contradictory second terminal checkpoint', async () => {
  const port = authority();
  port.finish = async () => ({ status: 'refused' });
  const r = await run(port, async (ctx) =>
    ctx.effect('mutation', async () => ({ deploymentId: 'dpl_result' }))
  );
  assert.equal(r.status, 'unknown');
  assert.equal(
    port.state.receipts.filter((r) => r.status === 'succeeded').length,
    1
  );
  assert.equal(
    port.state.receipts.some((r) => r.status === 'unknown'),
    false
  );
});
test('replay validates job, epoch, attempt, guard and evidence identity', async () => {
  const port = authority();
  const first = await run(port, async () => ({ deploymentId: 'dpl_result' }));
  for (const patch of [
    { jobId: 'foreign' },
    { epoch: 2 },
    { attemptId: 'other' },
    { guardCode: 'QUEUE_STOPPED' },
    { evidence: { deploymentId: 'dpl_forged' } },
    { providerOperationId: 'dpl_forged' },
  ]) {
    port.state.receipts.push({ ...first, ...patch });
    await assert.rejects(
      run(port, async () => {}),
      { guardCode: 'QUEUE_GRANT_INVALID' }
    );
  }
});
test('token-shaped values are refused in payloads and receipts without disclosure', async () => {
  const tokens = [
    'ghp_' + 'a'.repeat(36),
    'vca_' + 'b'.repeat(32),
    'github_pat_' + 'c'.repeat(35),
    // Public jwt.io sample, assembled at runtime so the source holds no JWT literal.
    [
      ['ey', 'JhbGciOiJIUzI1NiJ9'].join(''),
      ['ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0'].join(''),
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    ].join('.'),
    'Ab3dEf7hIj9kLm1nOp3qRs5tUv7wXy9zAb3dEf7hIj9k',
  ];
  for (const token of tokens) {
    const p = payload();
    p.authorizationRefs = [token];
    await assert.rejects(submitVercelRelease(authority(), p, target), {
      guardCode: 'QUEUE_PAYLOAD_INVALID',
    });
    const port = authority();
    const r = await run(port, async () => ({ detail: token }));
    assert.equal(r.guardCode, 'QUEUE_PAYLOAD_INVALID');
    assert.equal(JSON.stringify(r).includes(token), false);
    assert.equal(
      port.state.receipts.some((v) => JSON.stringify(v).includes(token)),
      false
    );
  }
});

test('authority predecessor credentials are refused before executor entry', async () => {
  const port = authority();
  let calls = 0;
  port.beginPhase = async () => ({
    status: 'running',
    predecessor: { evidence: 'ghp_' + 'a'.repeat(36) },
  });
  await assert.rejects(
    run(port, async () => {
      calls++;
    }),
    { guardCode: 'QUEUE_PAYLOAD_INVALID' }
  );
  assert.equal(calls, 0);
});

test('opaque low-entropy and digest-looking values cannot hide in approval refs', async () => {
  for (const value of ['A'.repeat(80), 'a'.repeat(64), 'a'.repeat(40)]) {
    const p = payload();
    p.authorizationRefs = [value];
    await assert.rejects(submitVercelRelease(authority(), p, target), {
      guardCode: 'QUEUE_PAYLOAD_INVALID',
    });
  }
});

test('replay refuses secret-named extras even when their values look public', async () => {
  const port = authority();
  const first = await run(port, async () => ({ deploymentId: 'dpl_result' }));
  port.state.receipts.push({ ...first, secrets: { note: 'fixture' } });
  await assert.rejects(
    run(port, async () => {}),
    { guardCode: 'QUEUE_GRANT_INVALID' }
  );
});

test('replay without evidence has a fixed refusal instead of a raw hash error', async () => {
  const port = authority();
  const first = await run(port, async () => ({ deploymentId: 'dpl_result' }));
  const replay = { ...first };
  delete replay.evidence;
  port.state.receipts.push(replay);
  await assert.rejects(
    run(port, async () => {}),
    { guardCode: 'QUEUE_GRANT_INVALID' }
  );
});

test('invalid host refuses before claim; a typed DNS host remains valid', async () => {
  const port = authority();
  let claims = 0;
  const claim = port.claim;
  port.claim = async (...args) => {
    claims++;
    return claim(...args);
  };
  await assert.rejects(
    executeVercelPhase({
      port,
      payload: payload(),
      reviewedTarget: target,
      host: 'ghp_' + 'a'.repeat(36),
      execute: async () => {
        throw new Error('unreachable');
      },
    }),
    { guardCode: 'QUEUE_PAYLOAD_INVALID' }
  );
  assert.equal(claims, 0);
  const r = await executeVercelPhase({
    port,
    payload: payload(),
    reviewedTarget: target,
    host: 'runner-01.studio-ci.tuturuuu',
    execute: async () => ({ deploymentId: 'dpl_result' }),
  });
  assert.equal(r.status, 'succeeded');
});
test('replay binds original receipt across a newly issued epoch', async () => {
  const port = authority();
  let effects = 0;
  const first = await run(port, async (ctx) =>
    ctx.effect('mutation', async () => {
      effects++;
      return { deploymentId: 'dpl_result' };
    })
  );
  port.state.epoch = 2;
  const claim = port.claim;
  port.claim = async (...args) => ({
    ...(await claim(...args)),
    attemptId: 'attempt-2',
  });
  port.beginPhase = async () => ({
    status: 'succeeded',
    receipt: first,
    originalAttempt: {
      attemptId: first.attemptId,
      epoch: first.epoch,
      receiptSha256: payloadDigest(first),
    },
  });
  assert.deepEqual(
    await run(port, async () => {
      effects++;
    }),
    first
  );
  assert.equal(effects, 1);
  port.beginPhase = async () => ({
    status: 'succeeded',
    receipt: { ...first, jobId: 'foreign' },
    originalAttempt: {
      attemptId: first.attemptId,
      epoch: first.epoch,
      receiptSha256: payloadDigest(first),
    },
  });
  await assert.rejects(
    run(port, async () => {}),
    { guardCode: 'QUEUE_GRANT_INVALID' }
  );
});

test('credential-bearing host labels refuse before claim and receipt persistence', async () => {
  for (const host of [
    `${'a'.repeat(64)}.runner.local`,
    `x-${'b'.repeat(40)}.ci`,
  ]) {
    const port = authority();
    let claims = 0;
    port.claim = async () => {
      claims++;
      throw new Error('must not claim');
    };
    await assert.rejects(
      executeVercelPhase({
        port,
        payload: payload(),
        reviewedTarget: target,
        host,
        execute: async () => ({}),
      }),
      { guardCode: 'QUEUE_PAYLOAD_INVALID' }
    );
    assert.equal(claims, 0);
    assert.equal(port.state.receipts.length, 0);
  }
});

test('lifecycle credentials never reach the qualification checkpoint', async () => {
  for (const id of ['a'.repeat(64), 'dpl_' + 'a'.repeat(64)]) {
    const port = authority();
    const result = await run(port, async (ctx) =>
      ctx.qualifyLifecycle({ candidate: { id } })
    );
    assert.equal(result.guardCode, 'QUEUE_PAYLOAD_INVALID');
    assert.equal(
      port.state.receipts.some((r) => r.status === 'qualification-request'),
      false
    );
    assert.equal(JSON.stringify(port.state.receipts).includes(id), false);
  }
});
test('failure phases are closed and failure receipts cannot persist credentials', async () => {
  const port = authority();
  const secret = 'a'.repeat(64);
  const result = await run(port, async () => {
    throw new QueueStop('QUEUE_STOPPED', secret);
  });
  assert.equal(result.guardPhase, 'stage');
  assert.equal(QUEUE_GUARD_PHASES.includes(result.guardPhase), true);
  assert.equal(JSON.stringify(port.state.receipts).includes(secret), false);
  const forged = await run(authority(), async () => {
    const error = new QueueStop('QUEUE_STOPPED', 'stage');
    error.guardCode = secret;
    throw error;
  });
  assert.equal(forged.guardCode, 'QUEUE_EXECUTION_FAILED');
});

test('UUID provenance, approvals, lock IDs and prefixed jobs reach a safe receipt', async () => {
  const port = authority();
  const uuid = randomUUID().toUpperCase();
  const claim = port.claim;
  const grant = async () => ({
    ...(await claim()),
    jobId: `job-stage-${uuid}`,
    targetLockId: uuid,
  });
  port.claim = grant;
  port.renew = grant;
  port.beginPhase = async () => ({
    status: 'running',
    approval: { reference: uuid },
    approvalVerificationId: uuid,
  });
  const job = payload();
  job.provenance.thread = uuid;
  job.provenance.actor = 'release-desk-calendar-production-operator';
  job.authorizationRefs = ['environment:vercel-production-calendar-approval'];
  const result = await run(
    port,
    async () => ({ deploymentId: 'dpl_verified' }),
    job
  );
  assert.equal(result.status, 'succeeded');
  assert.equal(result.jobId, `job-stage-${uuid}`);
  assert.equal(result.approvalVerificationId, uuid);
});

test('failure receipt scanning refuses authority identity mutation without persisting it', async () => {
  const port = authority();
  const claim = port.claim;
  let granted;
  port.claim = async () => (granted = await claim());
  const secret = 'f'.repeat(64);
  const result = await run(port, async () => {
    granted.jobId = secret;
    throw new Error('executor failure');
  });
  assert.equal(result.guardCode, 'QUEUE_PAYLOAD_INVALID');
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(port.state.receipts.length, 0);
});

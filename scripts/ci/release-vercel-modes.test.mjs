import { payloadDigest, aliasLockKey } from './release-vercel-queue.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_RELEASE_MODES,
  runningReleaseDigests,
  dispatchReleaseMode,
  runReleaseMode,
  validateReleaseModes,
} from './release-vercel-modes.mjs';
const sha = 'a'.repeat(40),
  seal = 'b'.repeat(64),
  digest = 'c'.repeat(64);
function fixture(mode) {
  const calls = [];
  const payload = {
    requestedPhases: [mode],
    operationId: 'fixture-operation',
    sourceSha: sha,
    configSha256: digest,
    recipeSha256: digest,
    target: {
      provider: 'vercel',
      account: 'fixture',
      app: 'calendar',
      alias: 'calendar.tuturuuu.com',
      project: 'prj_calendar',
      environment: 'vercel-production-calendar',
    },
    authorizationRefs: [
      'environment:vercel-production-calendar',
      'rex-promote:fixture',
      'rollback:fixture',
    ],
    artifact: { id: 'dpl_candidate', sha256: seal },
    rollback: {
      deploymentId: 'dpl_preimage',
      authorizationRef: 'rollback:fixture',
    },
  };
  const receipt = {
    schemaVersion: 1,
    status: 'succeeded',
    phase: mode === 'promote' ? 'stage' : 'promote',
    canonicalTarget: structuredClone(payload.target),
    alias: 'calendar.tuturuuu.com',
    projectId: 'prj_calendar',
    sourceSha: sha,
    configSha256: digest,
    recipeSha256: digest,
    artifactSha256: seal,
    candidate: { id: 'dpl_candidate' },
    preimage: { id: 'dpl_preimage' },
  };
  let current = mode === 'promote' ? 'dpl_preimage' : 'dpl_candidate';
  const provider = {
    async inspectAlias(alias) {
      calls.push(['inspect-alias', alias]);
      return {
        id: current,
        readyState: 'READY',
        projectId: 'prj_calendar',
        aliases: [alias],
      };
    },
    async inspectDeployment(id) {
      calls.push(['inspect-deployment', id]);
      return {
        id,
        readyState: 'READY',
        projectId: 'prj_calendar',
        sourceSha: sha,
        outputSeal: seal,
      };
    },
    async setAlias(value) {
      calls.push(['set-alias', value]);
      current = value.deploymentId;
    },
  };
  const context = {
    payload,
    predecessor: receipt,
    approvalVerificationId: 'approval-verified',
    approval: {
      permission: mode === 'promote' ? 'rex-promote' : 'rollback',
      reference:
        mode === 'promote' ? 'rex-promote:fixture' : 'rollback:fixture',
      sourceSha: sha,
      environment: 'vercel-production-calendar',
    },
    async checkFence() {
      calls.push(['fence']);
    },
    async effect(label, fn) {
      calls.push(['effect', label]);
      return fn();
    },
  };
  return {
    mode,
    config: CALENDAR_RELEASE_MODES,
    receipt,
    context,
    provider,
    sourceRef: 'refs/heads/production',
    verifySourceAncestry: async () => true,
    delay: async () => {},
    calls,
    payload,
  };
}

function bind(f) {
  const actual = runningReleaseDigests(f.config);
  Object.assign(f.payload, actual);
  Object.assign(f.receipt, actual);
  f.context.predecessorSha256 = payloadDigest(f.receipt);
  f.context.approval.predecessorSha256 = f.context.predecessorSha256;
  return f;
}
async function run(f) {
  bind(f);
  return runReleaseMode(f);
}
test('promotion is a separate dispatch and alias mutation has exact preimage/readback', async () => {
  const f = fixture('promote');
  const result = await run(f);
  assert.equal(result.terminalState, 'promoted');
  assert.equal(result.aliasReadbackId, 'dpl_candidate');
  assert.deepEqual(
    f.calls.filter(([name]) => name === 'set-alias'),
    [
      [
        'set-alias',
        {
          alias: 'calendar.tuturuuu.com',
          deploymentId: 'dpl_candidate',
          expectedCurrentId: 'dpl_preimage',
          operationId: 'fixture-operation',
        },
      ],
    ]
  );
  assert.equal(f.calls.filter(([name]) => name === 'inspect-alias').length, 2);
});
test('stage environment, main ref and missing Rex ACK refuse promotion before mutation', async () => {
  for (const alter of [
    (f) => {
      f.payload.target.environment = 'vercel-stage-calendar';
    },
    (f) => {
      f.sourceRef = 'refs/heads/main';
    },
    (f) => {
      f.payload.authorizationRefs = ['environment:vercel-production-calendar'];
    },
  ]) {
    const f = fixture('promote');
    alter(f);
    await assert.rejects(run(f), {
      guardCode: 'RELEASE_APPROVAL_REQUIRED',
    });
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('stale alias preimage or mismatched artifact prevents promotion', async () => {
  for (const alter of [
    (f) => {
      f.receipt.artifactSha256 = 'd'.repeat(64);
    },
    (f) => {
      f.provider.inspectAlias = async () => ({ id: 'dpl_foreign' });
    },
    (f) => {
      f.provider.inspectDeployment = async () => ({ id: 'dpl_foreign' });
    },
  ]) {
    const f = fixture('promote');
    alter(f);
    await assert.rejects(run(f));
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('rollback restores only the recorded preimage and reads it back', async () => {
  const f = fixture('rollback');
  const result = await run(f);
  assert.equal(result.terminalState, 'rolled-back');
  assert.equal(result.aliasReadbackId, 'dpl_preimage');
  assert.equal(
    f.calls.find(([name]) => name === 'set-alias')[1].deploymentId,
    'dpl_preimage'
  );
});
test('rollback requires its own authorization and refuses a different rollback target', async () => {
  for (const alter of [
    (f) => {
      f.payload.authorizationRefs = ['environment:vercel-production-calendar'];
    },
    (f) => {
      f.payload.rollback.deploymentId = 'dpl_other';
    },
  ]) {
    const f = fixture('rollback');
    alter(f);
    await assert.rejects(run(f));
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('failed alias readback is not a successful promotion', async () => {
  const f = fixture('promote');
  f.provider.setAlias = async () => {};
  await assert.rejects(run(f), {
    guardCode: 'RELEASE_ALIAS_MISMATCH',
  });
});
test('watch observes the full window with green probes', async () => {
  const f = fixture('watch');
  let time = 0;
  f.now = () => time;
  f.delay = async (ms) => {
    time += ms;
  };
  f.probe = async () => {
    time += 1500;
    return {
      smokeOk: true,
      errorRate: 0,
      sourceSha: sha,
      deploymentId: 'dpl_candidate',
    };
  };
  const result = await run(f);
  assert.equal(result.terminalState, 'watched');
  assert.ok(time >= 60000);
  assert.ok(time <= 65000);
});
test('watch error-rate and smoke thresholds request separately authorized rollback', async () => {
  for (const result of [
    { smokeOk: true, errorRate: 0.1 },
    { smokeOk: false, errorRate: 0 },
  ]) {
    const f = fixture('watch');
    f.now = () => 0;
    f.probe = async () => ({
      ...result,
      sourceSha: sha,
      deploymentId: 'dpl_candidate',
    });
    const output = await run(f);
    assert.equal(output.terminalState, 'rollback-required');
    assert.equal(output.rollbackDeploymentId, 'dpl_preimage');
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('missing probe data is not green', async () => {
  const f = fixture('watch');
  f.now = () => 0;
  f.probe = async () => undefined;
  await assert.rejects(run(f), { guardCode: 'RELEASE_PROBE_INVALID' });
});
test('watch timeout aborts its probe and is not success', async () => {
  const f = fixture('watch');
  f.config = { ...f.config, watchDurationMs: 20, probeTimeoutMs: 5 };
  let signal;
  f.probe = async (options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(run(f), {
    guardCode: 'RELEASE_WATCH_EXPIRED',
  });
  assert.equal(signal.aborted, true);
});
test('invalid config and stage dispatch cannot reach any provider', async () => {
  assert.throws(() =>
    validateReleaseModes({ ...CALENDAR_RELEASE_MODES, maxSamples: Infinity })
  );
  const f = fixture('stage');
  await assert.rejects(run(f));
  assert.equal(f.calls.length, 0);
});

test('fast green probes are spaced across the full observation window', async () => {
  const f = fixture('watch');
  let time = 0;
  const waits = [];
  f.config = { ...f.config, watchDurationMs: 100, maxSamples: 4 };
  f.now = () => time;
  f.delay = async (ms) => {
    waits.push(ms);
    time += ms;
  };
  f.probe = async () => ({
    smokeOk: true,
    errorRate: 0,
    sourceSha: sha,
    deploymentId: 'dpl_candidate',
  });
  assert.equal((await run(f)).terminalState, 'watched');
  assert.ok(time >= 100);
  assert.ok(waits.length <= 4);
});

function dispatchFixture(mode) {
  const f = bind(fixture(mode));
  Object.assign(f.payload, {
    schemaVersion: 1,
    jobType: 'vercel-release',
    repository: 'tutur3u/platform',
    requirements: {
      os: 'darwin',
      arch: 'arm64',
      toolchain: 'node24',
      capabilities: ['offline'],
      cpu: 1,
      ramMiB: 512,
      diskMiB: 512,
      maxDurationMs: 90000,
      infrastructureRetryLimit: 0,
    },
    provenance: { actor: 'fixture', thread: 'fixture' },
  });
  const grant = {
    jobId: 'job-1',
    attemptId: 'attempt-1',
    workerId: 'worker-1',
    epoch: 1,
    targetLockId: 'lock-1',
    aliasLockKey: aliasLockKey(f.payload.target),
    stopRevision: 0,
    leaseDeadline: 200,
    authorityNow: 100,
  };
  f.port = {
    claim: async () => grant,
    renew: async () => grant,
    beginPhase: async () => ({
      status: 'running',
      predecessor: f.receipt,
      predecessorSha256: payloadDigest(f.receipt),
      approval: f.context.approval,
      approvalVerificationId: 'verified-approval',
    }),
    checkpoint: async () => ({ status: 'running' }),
    finish: async () => ({ status: 'succeeded' }),
  };
  f.host = 'studio-offline';
  return f;
}
test('dispatch preserves approval STOP as failed with exact phase', async () => {
  const f = dispatchFixture('promote');
  f.payload.authorizationRefs = ['environment:vercel-production-calendar'];
  const result = await dispatchReleaseMode(f);
  assert.equal(result.status, 'failed');
  assert.equal(result.guardCode, 'RELEASE_APPROVAL_REQUIRED');
  assert.equal(result.guardPhase, 'approval');
});
test('dispatch preserves post-mutation readback STOP as UNKNOWN', async () => {
  const f = dispatchFixture('promote');
  f.provider.setAlias = async () => {};
  const result = await dispatchReleaseMode(f);
  assert.equal(result.status, 'unknown');
  assert.equal(result.guardCode, 'RELEASE_ALIAS_MISMATCH');
  assert.equal(result.guardPhase, 'alias-readback');
});
test('predecessor status, phase, digest and actual running digests are enforced', async () => {
  for (const alter of [
    (f) => {
      f.receipt.status = 'failed';
    },
    (f) => {
      f.receipt.phase = 'rollback';
    },
    (f) => {
      f.context.predecessorSha256 = 'd'.repeat(64);
    },
    (f) => {
      f.config = { ...f.config, maxErrorRate: 0.2 };
    },
    (f) => {
      f.payload.recipeSha256 = 'd'.repeat(64);
      f.receipt.recipeSha256 = f.payload.recipeSha256;
    },
  ]) {
    const f = bind(fixture('promote'));
    alter(f);
    await assert.rejects(runReleaseMode(f), {
      guardCode: 'RELEASE_RECEIPT_MISMATCH',
    });
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('exact ACK, recorded rollback identity and ancestry are required', async () => {
  for (const alter of [
    (f) => {
      f.context.approval.reference = 'rex-promote:other';
    },
    (f) => {
      f.verifySourceAncestry = async () => false;
    },
  ]) {
    const f = bind(fixture('promote'));
    alter(f);
    await assert.rejects(runReleaseMode(f));
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
  const f = bind(fixture('rollback'));
  f.payload.rollback.authorizationRef = 'rollback:other';
  await assert.rejects(runReleaseMode(f), {
    guardCode: 'RELEASE_APPROVAL_REQUIRED',
  });
});
test('already applied promote or rollback is verified without alias mutation', async () => {
  for (const mode of ['promote', 'rollback']) {
    const f = bind(fixture(mode));
    const to = mode === 'promote' ? 'dpl_candidate' : 'dpl_preimage';
    f.provider.inspectAlias = async () => ({
      id: to,
      readyState: 'READY',
      projectId: 'prj_calendar',
      aliases: ['calendar.tuturuuu.com'],
    });
    assert.equal((await runReleaseMode(f)).aliasReadbackId, to);
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('healthy 1500ms probes and early timers repeatedly finish green', async () => {
  for (let repeat = 0; repeat < 20; repeat++) {
    const f = bind(fixture('watch'));
    let time = 0;
    f.now = () => time;
    f.delay = async (ms) => {
      time += Math.max(0, ms - 1);
    };
    f.probe = async ({ timeoutMs }) => {
      assert.equal(timeoutMs, 5000);
      time += 1500;
      return {
        smokeOk: true,
        errorRate: 0,
        sourceSha: sha,
        deploymentId: 'dpl_candidate',
      };
    };
    const result = await runReleaseMode(f);
    assert.equal(result.terminalState, 'watched');
    assert.ok(time >= 60000 && time <= 65000);
  }
});

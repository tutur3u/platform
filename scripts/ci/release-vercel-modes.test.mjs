import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { aliasLockKey, payloadDigest } from './release-vercel-queue.mjs';
import { CALENDAR_VERCEL } from './release-vercel-config.mjs';
import {
  CALENDAR_RELEASE_MODES,
  dispatchReleaseMode,
  dispatchReleaseModeForTest,
  runningReleaseDigests,
  runReleaseMode,
} from './release-vercel-modes.mjs';
const sha = 'a'.repeat(40),
  seal = 'b'.repeat(64);
function fixture() {
  const state = {
    current: 'dpl_preimage',
    calls: [],
    receipts: {},
    time: 0,
    sequence: 0,
  };
  const target = {
    provider: 'vercel',
    account: 'fixture',
    project: 'prj_calendar',
    app: 'calendar',
    alias: 'calendar.tuturuuu.com',
    environment: 'vercel-stage-calendar',
  };
  const live = () => ({
    id: state.current,
    url: `https://${state.current}.vercel.app`,
    readyState: 'READY',
    projectId: target.project,
    aliases: [target.alias],
    commitSha: '9'.repeat(40),
    mainSha: '',
  });
  const candidate = {
    id: 'dpl_candidate',
    url: 'https://candidate.vercel.app',
    readyState: 'READY',
    projectId: target.project,
    aliases: [],
    commitSha: sha,
    mainSha: sha,
    outputSeal: seal,
  };
  const stageDependencies = {
    projectId: target.project,
    aliasPreimage: 'dpl_preimage',
    verifySource: async () => sha,
    verifyLegacyBuild: async () => {},
    inspectAlias: async () => live(),
    recordPreimage: async () => {},
    pull: async () => {},
    build: async () => {},
    assertSensitiveOutput: async () => {},
    seal: async () => seal,
    stage: async () => {
      state.calls.push('stage-upload');
      return candidate;
    },
    readSupabaseUrl: async () => `https://${CALENDAR_VERCEL.supabaseHost}`,
    record: async () => {},
  };
  const provider = {
    inspectAlias: async () => live(),
    inspectDeployment: async (id) => ({
      id,
      projectId: target.project,
      readyState: 'READY',
      sourceSha: sha,
      outputSeal: seal,
    }),
    setAlias: async ({ deploymentId }) => {
      state.calls.push('set-alias');
      state.current = deploymentId;
    },
  };
  let job, grant;
  const port = {
    claim: async (value) => {
      job = value;
      grant = {
        jobId: `job-${value.operationId}`,
        attemptId: 'attempt-1',
        workerId: 'worker-1',
        epoch: 1,
        targetLockId: 'lock-1',
        aliasLockKey: aliasLockKey(value.target),
        stopRevision: 0,
        leaseDeadline: 200,
        authorityNow: 100,
      };
      return grant;
    },
    renew: async () => grant,
    beginPhase: async () => {
      const phase = job.requestedPhases[0],
        predecessor =
          state.predecessorOverride ??
          state.receipts[phase === 'promote' ? 'stage' : 'promote'];
      return {
        status: 'running',
        predecessor,
        predecessorSha256: predecessor ? payloadDigest(predecessor) : undefined,
        approvalVerificationId: 'approval-verified',
        approval: {
          permission: phase === 'promote' ? 'rex-promote' : 'rollback',
          reference:
            phase === 'promote' ? 'rex-promote:fixture' : 'rollback:fixture',
          sourceSha: sha,
          environment: 'vercel-production-calendar',
          predecessorSha256: predecessor
            ? payloadDigest(predecessor)
            : undefined,
        },
      };
    },
    checkpoint: async (_grant, value) =>
      value.status === 'qualification-request'
        ? {
            status: 'running',
            lifecycleSha256: payloadDigest(value.lifecycle),
            qualification: {
              c1: 'passed',
              staticAuth: 'passed',
              delta: 'passed',
              qualification: 'passed',
            },
          }
        : { status: 'running' },
    finish: async (_grant, [receipt]) => {
      state.receipts[receipt.phase] = receipt;
      return { status: 'succeeded' };
    },
  };
  const hooks = {
    sourceRef: 'refs/heads/production',
    stageSource: async () => sha,
    verifySourceAncestry: async () => true,
    now: () => state.time,
    delay: async (ms) => {
      state.time += ms;
    },
  };
  function options(phase) {
    const predecessor =
      state.receipts[phase === 'promote' ? 'stage' : 'promote'];
    const payload = {
      schemaVersion: 1,
      jobType: 'vercel-release',
      operationId: `${phase}-${++state.sequence}`,
      repository: 'tutur3u/platform',
      sourceSha: sha,
      ...runningReleaseDigests('calendar'),
      target: {
        ...target,
        environment:
          phase === 'stage'
            ? 'vercel-stage-calendar'
            : 'vercel-production-calendar',
      },
      requestedPhases: [phase],
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
      authorizationRefs: [
        'environment:vercel-production-calendar',
        'rex-promote:fixture',
        'rollback:fixture',
      ],
      rollback: {
        deploymentId: 'dpl_preimage',
        authorizationRef: 'rollback:fixture',
      },
      provenance: { actor: 'fixture', thread: 'fixture' },
    };
    if (phase !== 'stage')
      payload.artifact = {
        id: predecessor?.candidate.id,
        sha256: predecessor?.artifactSha256,
      };
    return {
      port,
      payload,
      reviewedTarget: payload.target,
      receipt: predecessor,
      host: 'studio-offline',
      stageDependencies,
      provider,
      probe: async () => ({
        smokeOk: true,
        errorRate: 0,
        sourceSha: sha,
        deploymentId: 'dpl_candidate',
      }),
    };
  }
  const run = async (phase, alter = (o) => o) =>
    dispatchReleaseModeForTest(alter(options(phase)), {
      ...hooks,
      sourceRef: phase === 'stage' ? 'refs/heads/main' : hooks.sourceRef,
    });
  return { state, port, hooks, options, run, provider };
}
async function promoted() {
  const f = fixture();
  assert.equal((await f.run('stage')).status, 'succeeded');
  assert.equal((await f.run('promote')).status, 'succeeded');
  return f;
}

test('real stage and promote receipts feed watch and recorded-preimage rollback', async () => {
  const f = await promoted();
  const stage = f.state.receipts.stage,
    promote = f.state.receipts.promote;
  assert.equal(stage.phase, 'stage');
  assert.equal(stage.candidate.id, 'dpl_candidate');
  assert.equal(stage.preimage.id, 'dpl_preimage');
  assert.deepEqual(stage.qualification, {
    c1: 'passed',
    staticAuth: 'passed',
    delta: 'passed',
    qualification: 'passed',
  });
  assert.equal(promote.phase, 'promote');
  assert.equal(promote.projectId, 'prj_calendar');
  assert.equal(promote.alias, 'calendar.tuturuuu.com');
  const watch = await f.run('watch');
  assert.equal(watch.status, 'succeeded');
  assert.equal(watch.evidence.terminalState, 'watched');
  const rollback = await f.run('rollback');
  assert.equal(rollback.status, 'succeeded');
  assert.equal(rollback.evidence.aliasReadbackId, 'dpl_preimage');
  assert.deepEqual(f.state.calls, ['stage-upload', 'set-alias', 'set-alias']);
});
test('committed config rejects caller thresholds even with a recomputed digest', async () => {
  const f = await promoted();
  const o = f.options('watch');
  o.config = { ...CALENDAR_RELEASE_MODES, maxErrorRate: 1 };
  o.payload.configSha256 = payloadDigest({
    vercel: CALENDAR_VERCEL,
    modes: o.config,
  });
  await assert.rejects(dispatchReleaseMode(o), {
    guardCode: 'RELEASE_CONFIG_INVALID',
  });
  const stage = fixture();
  await assert.rejects(
    stage.run('stage', (o) => ({
      ...o,
      payload: { ...o.payload, configSha256: 'f'.repeat(64) },
    })),
    { guardCode: 'RELEASE_RECEIPT_MISMATCH' }
  );
});
test('dispatch refuses failed/wrong predecessor and artifact tampering', async () => {
  for (const patch of [
    { status: 'failed' },
    { phase: 'rollback' },
    { sourceSha: 'd'.repeat(40) },
    { qualification: {} },
  ]) {
    const f = fixture();
    await f.run('stage');
    f.state.predecessorOverride = { ...f.state.receipts.stage, ...patch };
    const result = await f.run('promote');
    assert.equal(result.status, 'failed');
    assert.equal(result.guardCode, 'RELEASE_RECEIPT_MISMATCH');
    assert.equal(f.state.calls.includes('set-alias'), false);
  }
});
test('dispatch preserves exact approval failure and post-write alias STOP', async () => {
  const f = fixture();
  await f.run('stage');
  const refused = await f.run('promote', (o) => ({
    ...o,
    payload: {
      ...o.payload,
      authorizationRefs: ['environment:vercel-production-calendar'],
    },
  }));
  assert.equal(refused.status, 'failed');
  assert.equal(refused.guardCode, 'RELEASE_APPROVAL_REQUIRED');
  assert.equal(refused.guardPhase, 'approval');
  f.provider.setAlias = async () => {};
  const unknown = await f.run('promote');
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.guardCode, 'RELEASE_ALIAS_MISMATCH');
  assert.equal(unknown.guardPhase, 'alias-readback');
});
test('recorded target and exact rollback authorization cannot be replaced', async () => {
  const f = await promoted();
  const refused = await f.run('rollback', (o) => ({
    ...o,
    payload: {
      ...o.payload,
      rollback: {
        deploymentId: 'dpl_foreign',
        authorizationRef: 'rollback:fixture',
      },
    },
  }));
  assert.equal(refused.status, 'failed');
  assert.equal(refused.guardCode, 'RELEASE_RECEIPT_MISMATCH');
  const ack = await f.run('rollback', (o) => ({
    ...o,
    payload: {
      ...o.payload,
      rollback: {
        deploymentId: 'dpl_preimage',
        authorizationRef: 'rollback:other',
      },
    },
  }));
  assert.equal(ack.guardCode, 'RELEASE_APPROVAL_REQUIRED');
});
test('already applied promote/rollback is verified without another mutation', async () => {
  const f = await promoted();
  const count = f.state.calls.length;
  await f.run('promote');
  assert.equal(f.state.calls.length, count);
  await f.run('rollback');
  const after = f.state.calls.length;
  await f.run('rollback');
  assert.equal(f.state.calls.length, after);
});
test('watch thresholds emit rollback-required without alias writes', async () => {
  for (const sample of [
    { smokeOk: false, errorRate: 0 },
    { smokeOk: true, errorRate: 0.5 },
  ]) {
    const f = await promoted();
    const n = f.state.calls.length;
    const result = await f.run('watch', (o) => ({
      ...o,
      probe: async () => ({
        ...sample,
        sourceSha: sha,
        deploymentId: 'dpl_candidate',
      }),
    }));
    assert.equal(result.evidence.terminalState, 'rollback-required');
    assert.equal(f.state.calls.length, n);
  }
});
test('healthy 1500ms probes and early timers repeatedly cover the committed window', async () => {
  for (let i = 0; i < 20; i++) {
    const f = await promoted();
    f.hooks.delay = async (ms) => {
      f.state.time += Math.max(0, ms - 1);
    };
    const result = await f.run('watch', (o) => ({
      ...o,
      probe: async ({ timeoutMs }) => {
        assert.equal(timeoutMs, 5000);
        f.state.time += 1500;
        return {
          smokeOk: true,
          errorRate: 0,
          sourceSha: sha,
          deploymentId: 'dpl_candidate',
        };
      },
    }));
    assert.equal(result.status, 'succeeded');
    assert.ok(f.state.time >= 60000 && f.state.time <= 65000);
  }
});
test('frozen clock fails closed with bounded delay attempts', async () => {
  const f = await promoted();
  let waits = 0;
  f.hooks.now = () => 0;
  f.hooks.delay = async () => {
    waits++;
  };
  const result = await f.run('watch');
  assert.equal(result.status, 'failed');
  assert.equal(result.guardCode, 'RELEASE_WATCH_EXPIRED');
  assert.ok(waits <= 100);
});
test('production dispatch ignores caller ancestry/ref/clock substitutions', async () => {
  const f = fixture();
  await f.run('stage');
  const o = f.options('promote');
  let called = 0;
  const result = await dispatchReleaseMode({
    ...o,
    sourceRef: 'refs/heads/production',
    stageSource: async () => sha,
    verifySourceAncestry: async () => {
      called++;
      return true;
    },
    now: () => {
      throw new Error('caller clock');
    },
    delay: async () => {},
  });
  assert.equal(result.status, 'failed');
  assert.equal(called, 0);
  assert.ok(
    ['RELEASE_APPROVAL_REQUIRED', 'RELEASE_RECEIPT_MISMATCH'].includes(
      result.guardCode
    )
  );
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {dispatchReleaseModeForTest} from ${JSON.stringify(new URL('./release-vercel-modes.mjs', import.meta.url).href)}; try {await dispatchReleaseModeForTest({},{});process.exit(1);}catch(e){if(e.guardPhase!=='test-hook')process.exit(2);}`,
    ],
    { env: { PATH: process.env.PATH }, encoding: 'utf8' }
  );
  assert.equal(child.status, 0, child.stderr);
});
test('source ancestry refusal remains a lifecycle STOP', async () => {
  const f = fixture();
  await f.run('stage');
  f.hooks.verifySourceAncestry = async () => false;
  const r = await f.run('promote');
  assert.equal(r.guardPhase, 'source-ancestry');
  assert.equal(r.status, 'failed');
});

test('stage source verification cannot be replaced through caller dependencies', async () => {
  const f = fixture();
  let calls = 0;
  const stage = await f.run('stage', (o) => ({
    ...o,
    stageDependencies: {
      ...o.stageDependencies,
      verifySource: async () => {
        calls++;
        return 'd'.repeat(40);
      },
    },
  }));
  assert.equal(stage.status, 'succeeded');
  assert.equal(stage.sourceSha, sha);
  assert.equal(calls, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_RELEASE_MODES,
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
      project: 'prj_calendar',
      environment: 'vercel-production-calendar',
    },
    authorizationRefs: [
      'environment:vercel-production-calendar',
      'rex-promote:fixture',
      'rollback:fixture',
    ],
    artifact: { id: 'dpl_candidate', sha256: seal },
    rollback: { deploymentId: 'dpl_preimage' },
  };
  const receipt = {
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
    delay: async () => {},
    calls,
    payload,
  };
}

test('promotion is a separate dispatch and alias mutation has exact preimage/readback', async () => {
  const f = fixture('promote');
  const result = await runReleaseMode(f);
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
    await assert.rejects(runReleaseMode(f), {
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
    await assert.rejects(runReleaseMode(f));
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('rollback restores only the recorded preimage and reads it back', async () => {
  const f = fixture('rollback');
  const result = await runReleaseMode(f);
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
    await assert.rejects(runReleaseMode(f));
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('failed alias readback is not a successful promotion', async () => {
  const f = fixture('promote');
  f.provider.setAlias = async () => {};
  await assert.rejects(runReleaseMode(f), {
    guardCode: 'RELEASE_ALIAS_MISMATCH',
  });
});
test('watch consumes the full bounded window with green smoke and error probe', async () => {
  const f = fixture('watch');
  let time = 0,
    samples = 0;
  f.now = () => time;
  f.probe = async () => {
    samples++;
    time += 30_000;
    return {
      smokeOk: true,
      errorRate: 0,
      sourceSha: sha,
      deploymentId: 'dpl_candidate',
    };
  };
  assert.deepEqual(await runReleaseMode(f), {
    terminalState: 'watched',
    samples: 2,
    deploymentId: 'dpl_candidate',
  });
  assert.equal(samples, 2);
  assert.equal(
    f.calls.some(([name]) => name === 'set-alias'),
    false
  );
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
    const output = await runReleaseMode(f);
    assert.equal(output.terminalState, 'rollback-required');
    assert.equal(output.rollbackDeploymentId, 'dpl_preimage');
    assert.equal(
      f.calls.some(([name]) => name === 'set-alias'),
      false
    );
  }
});
test('missing probe data is not green and exhausting sample cap is incomplete', async () => {
  for (const result of [
    undefined,
    {
      smokeOk: true,
      errorRate: 0,
      sourceSha: sha,
      deploymentId: 'dpl_candidate',
    },
  ]) {
    const f = fixture('watch');
    f.now = () => 0;
    let calls = 0;
    f.probe = async () => {
      calls++;
      return result;
    };
    await assert.rejects(runReleaseMode(f));
    assert.ok(calls <= f.config.maxSamples);
  }
});
test('watch timeout aborts its probe and is not success', async () => {
  const f = fixture('watch');
  f.config = { ...f.config, watchDurationMs: 20, probeTimeoutMs: 5 };
  let signal;
  f.probe = async (options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(runReleaseMode(f), {
    guardCode: 'RELEASE_WATCH_EXPIRED',
  });
  assert.equal(signal.aborted, true);
});
test('invalid config and stage dispatch cannot reach any provider', async () => {
  assert.throws(() =>
    validateReleaseModes({ ...CALENDAR_RELEASE_MODES, maxSamples: Infinity })
  );
  const f = fixture('stage');
  await assert.rejects(runReleaseMode(f));
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
  assert.equal((await runReleaseMode(f)).terminalState, 'watched');
  assert.deepEqual(waits, [25, 25, 25, 25]);
});

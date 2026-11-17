import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture, promoted, sha } from './release-vercel-test-fixture.mjs';
import {
  CALENDAR_RELEASE_MODES,
  runReleaseMode,
} from './release-vercel-modes.mjs';
import { payloadDigest } from './release-vercel-queue.mjs';
import { stop } from './calendar-exact-sha-stop.mjs';

test('publisher guard codes and phases survive stage dispatch', async () => {
  const scenarios = [
    [
      'OUTPUT_ENV_FILE',
      'sensitive-output',
      (f) => writeFileSync(join(f.output, '.env.fixture'), 'fixture'),
      'failed',
    ],
    [
      'BUILD_RECIPE_NOT_LEGACY',
      'verify-legacy-build',
      (f) =>
        writeFileSync(join(f.app, 'vercel.json'), '{"buildCommand":"other"}'),
      'failed',
    ],
    [
      'ALIAS_PREIMAGE_MISMATCH',
      'alias-preimage',
      (f) => {
        f.state.current = 'dpl_foreign';
      },
      'failed',
    ],
    [
      'OUTPUT_NATIVE_ARTIFACT',
      'seal',
      (f) =>
        writeFileSync(
          join(f.output, 'config.json'),
          '{"version":3,"framework":"void"}'
        ),
      'failed',
    ],
    [
      'SOURCE_NOT_ON_MAIN',
      'verify-source',
      (f) => {
        f.hooks.stageSource = () => {
          throw stop('SOURCE_NOT_ON_MAIN', 'source refused');
        };
      },
      'failed',
    ],
    [
      'SUPABASE_HOST_REJECTED',
      'guard',
      (f) =>
        writeFileSync(
          join(f.app, '.vercel/.env.production.local'),
          'NEXT_PUBLIC_SUPABASE_URL=https://other.supabase.co\n'
        ),
      'unknown',
    ],
  ];
  for (const [code, phase, alter, status] of scenarios) {
    const f = fixture();
    alter(f);
    const r = await f.run('stage');
    assert.equal(r.guardCode, code);
    assert.equal(r.guardPhase, phase);
    assert.equal(r.status, status);
  }
});
test('alias/account/project relabelling is refused before source or transport', async () => {
  for (const patch of [
    { alias: 'other.tuturuuu.com' },
    { account: 'fixture-b' },
    { project: 'prj_foreign' },
  ]) {
    const f = fixture();
    let source = 0;
    f.hooks.stageSource = async () => {
      source++;
      return sha;
    };
    await assert.rejects(
      f.run('stage', (o) => ({
        ...o,
        payload: { ...o.payload, target: { ...o.payload.target, ...patch } },
        reviewedTarget: { ...o.payload.target, ...patch },
      })),
      { guardCode: 'QUEUE_PAYLOAD_INVALID' }
    );
    assert.equal(source, 0);
    assert.equal(f.state.calls.length, 0);
  }
});
test('caller no-op guards cannot bypass real sensitive scan or Supabase pin', async () => {
  for (const file of ['output', 'env']) {
    const f = fixture();
    if (file === 'output')
      writeFileSync(join(f.output, '.env.fixture'), 'fixture');
    else
      writeFileSync(
        join(f.app, '.vercel/.env.production.local'),
        'NEXT_PUBLIC_SUPABASE_URL=https://other.supabase.co\n'
      );
    let called = 0;
    const r = await f.run('stage', (o) => ({
      ...o,
      stageDependencies: {
        assertSensitiveOutput: () => {
          called++;
        },
        seal: () => 'a'.repeat(64),
        readSupabaseUrl: () => 'https://allowed.invalid',
        verifyLegacyBuild: () => {},
      },
    }));
    assert.equal(called, 0);
    assert.equal(
      r.guardCode,
      file === 'output' ? 'OUTPUT_ENV_FILE' : 'SUPABASE_HOST_REJECTED'
    );
  }
});
test('hung probe aborts its signal at the committed timeout', async () => {
  const f = await promoted();
  let signal;
  const r = await f.run('watch', (o) => ({
    ...o,
    probe: async (value) => {
      signal = value.signal;
      return new Promise(() => {});
    },
  }));
  assert.equal(r.status, 'failed');
  assert.equal(r.guardCode, 'RELEASE_WATCH_EXPIRED');
  assert.equal(signal.aborted, true);
});
test('missing probe data is never green', async () => {
  const f = await promoted();
  const r = await f.run('watch', (o) => ({
    ...o,
    probe: async () => undefined,
  }));
  assert.equal(r.guardCode, 'RELEASE_PROBE_INVALID');
  assert.equal(r.status, 'failed');
});
test('stale alias and target readback mismatch prevent promotion writes', async () => {
  for (const target of ['alias', 'deployment']) {
    const f = fixture();
    await f.run('stage');
    if (target === 'alias') f.state.current = 'dpl_foreign';
    else f.provider.inspectDeployment = async () => ({ id: 'dpl_foreign' });
    const r = await f.run('promote');
    assert.equal(r.status, 'failed');
    assert.equal(
      r.guardCode,
      target === 'alias' ? 'RELEASE_ALIAS_MISMATCH' : 'RELEASE_RECEIPT_MISMATCH'
    );
    assert.equal(
      r.guardPhase,
      target === 'alias' ? 'alias-readback' : 'target-readback'
    );
    assert.equal(f.state.calls.includes('set-alias'), false);
  }
});
test('stage environment and invalid config refuse promotion', async () => {
  const f = fixture();
  await f.run('stage');
  await assert.rejects(
    f.run('promote', (o) => ({
      ...o,
      payload: {
        ...o.payload,
        target: { ...o.payload.target, environment: 'vercel-stage-calendar' },
      },
    })),
    { guardCode: 'QUEUE_PAYLOAD_INVALID' }
  );
  await assert.rejects(
    f.run('promote', (o) => ({
      ...o,
      config: { ...CALENDAR_RELEASE_MODES, maxSamples: Infinity },
    })),
    { guardCode: 'RELEASE_CONFIG_INVALID' }
  );
  assert.equal(f.state.calls.includes('set-alias'), false);
});
test('fast green probes are spaced across the full observation window', async () => {
  const f = await promoted();
  const starts = [];
  const r = await f.run('watch', (o) => ({
    ...o,
    probe: async () => {
      starts.push(f.state.time);
      return {
        smokeOk: true,
        errorRate: 0,
        sourceSha: sha,
        deploymentId: 'dpl_candidate',
      };
    },
  }));
  assert.equal(r.evidence.terminalState, 'watched');
  assert.equal(starts.length, 12);
  assert.ok(starts.at(-1) >= 55000);
  assert.ok(f.state.time >= 60000);
});
test('direct mode cannot replace committed safety thresholds', async () => {
  const f = await promoted();
  const o = f.options('watch');
  const predecessor = f.state.receipts.promote;
  const r = await runReleaseMode({
    mode: 'watch',
    config: { ...CALENDAR_RELEASE_MODES, maxErrorRate: 1 },
    context: {
      payload: o.payload,
      predecessor,
      predecessorSha256: payloadDigest(predecessor),
      approvalVerificationId: 'verified',
      checkFence: async () => {},
    },
    probe: async () => ({
      smokeOk: true,
      errorRate: 0.5,
      sourceSha: sha,
      deploymentId: 'dpl_candidate',
    }),
  });
  assert.equal(r.terminalState, 'rollback-required');
});
test('spoofed Node test context cannot enable hooks on workflow events', () => {
  for (const event of ['push', 'schedule', 'workflow_dispatch']) {
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {dispatchReleaseModeForTest} from ${JSON.stringify(new URL('./release-vercel-modes.mjs', import.meta.url).href)};try{await dispatchReleaseModeForTest({},{});process.exit(1);}catch(e){if(e.guardPhase!=='test-hook')process.exit(2);}`,
      ],
      {
        env: {
          PATH: process.env.PATH,
          NODE_TEST_CONTEXT: 'child',
          GITHUB_EVENT_NAME: event,
          GITHUB_ACTIONS: 'true',
        },
        encoding: 'utf8',
      }
    );
    assert.equal(r.status, 0, r.stderr);
  }
});

test('typed queue checkpoint failures survive the publisher normalizer', async () => {
  const f = fixture();
  f.port.checkpoint = async () => {
    throw new Error('offline');
  };
  const r = await f.run('stage');
  assert.equal(r.status, 'failed');
  assert.equal(r.guardCode, 'QUEUE_AUTHORITY_UNAVAILABLE');
  assert.equal(r.guardPhase, 'stage');
  assert.equal(f.state.calls.length, 0);
});

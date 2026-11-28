import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertResolvedVersionsAbsent,
  isResolvedFailedNoWrite,
  matchesFailedNoWriteResolution,
} from './wave1-native-production-resolution.mjs';

const RECEIPT_BASELINE = {
  deployment: 'e77a63b0-ec5d-46bf-bb89-b1829066ba90',
  version: '1a7cbbd0-d3a2-415f-8b75-890a1412c3f0',
};
// Live rollback captured in the 28 November 2026 read-only pre-publication capture.
const CURRENT_BASELINE = {
  deployment: 'eb610155-8e35-4fea-89df-3ec80c1be5c6',
  version: '808c2f3b-9979-4ccc-92a3-879043f25163',
};
const reviewedRecords = JSON.parse(
  readFileSync(
    new URL('./wave1-native-production-resolutions.json', import.meta.url),
    'utf8'
  )
);

function originalFixture() {
  const resolution = {
    outcome: 'failed-no-write',
    repository: 'tutur3u/platform',
    app: 'calendar',
    worker: 'tuturuuu-calendar',
    runId: '40413173161',
    runAttempt: '1',
    sha: 'ac8beee09e9700b453a55e193db5957985e01956',
    digest: '2116459bf121f09a7a714889d13d291a9823b451285747602a67eb0e50435b97',
    receiptBaselineDeploymentId: RECEIPT_BASELINE.deployment,
    receiptBaselineVersionId: RECEIPT_BASELINE.version,
    currentBaselineDeploymentId: CURRENT_BASELINE.deployment,
    currentBaselineVersionId: CURRENT_BASELINE.version,
  };
  // Each external object is independent. A mutated receipt cannot rewrite a job or run.
  const context = {
    env: {
      GITHUB_REPOSITORY: 'tutur3u/platform',
      GITHUB_RUN_ID: '40413173163',
    },
    app: 'calendar',
    worker: 'tuturuuu-calendar',
    run: {
      id: 40413173161,
      head_sha: 'ac8beee09e9700b453a55e193db5957985e01956',
    },
    job: { run_id: 40413173161, run_attempt: 1 },
    receipt: {
      app: 'calendar',
      worker: 'tuturuuu-calendar',
      runId: '40413173161',
      runAttempt: '1',
      sha: 'ac8beee09e9700b453a55e193db5957985e01956',
      digest:
        '2116459bf121f09a7a714889d13d291a9823b451285747602a67eb0e50435b97',
      state: 'pending',
      rollback: {
        id: RECEIPT_BASELINE.deployment,
        versions: [{ version_id: RECEIPT_BASELINE.version, percentage: 100 }],
      },
    },
    rollback: {
      id: CURRENT_BASELINE.deployment,
      versions: [{ version_id: CURRENT_BASELINE.version, percentage: 100 }],
    },
  };
  return { resolution, context };
}

function replayFixture() {
  const p = originalFixture();
  p.resolution = {
    ...p.resolution,
    runId: '40428329193',
    sha: '766c457a4c17797c6b62bb4a8a5c607bdfa0b91b',
    digest: '6dec01d9d95a94cfe543afddc402ea15cb4b1018d03fd335aaca08463b2ba51b',
  };
  p.context.env.GITHUB_RUN_ID = '40428329195';
  p.context.run = {
    id: 40428329193,
    head_sha: '766c457a4c17797c6b62bb4a8a5c607bdfa0b91b',
  };
  p.context.job = { run_id: 40428329193, run_attempt: 1 };
  p.context.receipt = {
    ...p.context.receipt,
    runId: '40428329193',
    sha: '766c457a4c17797c6b62bb4a8a5c607bdfa0b91b',
    digest: '6dec01d9d95a94cfe543afddc402ea15cb4b1018d03fd335aaca08463b2ba51b',
  };
  return p;
}

/** Build the observed context for one record, exactly as the history reader would. */
function contextFor(record) {
  const runId = Number(record.runId);
  return {
    env: {
      GITHUB_REPOSITORY: record.repository,
      GITHUB_RUN_ID: String(runId + 2),
    },
    app: record.app,
    worker: record.worker,
    run: { id: runId, head_sha: record.sha },
    job: { run_id: runId, run_attempt: Number(record.runAttempt) },
    receipt: {
      app: record.app,
      worker: record.worker,
      runId: record.runId,
      runAttempt: record.runAttempt,
      sha: record.sha,
      digest: record.digest,
      state: 'pending',
      rollback: {
        id: record.receiptBaselineDeploymentId,
        versions: [
          { version_id: record.receiptBaselineVersionId, percentage: 100 },
        ],
      },
    },
    rollback: {
      id: record.currentBaselineDeploymentId,
      versions: [
        { version_id: record.currentBaselineVersionId, percentage: 100 },
      ],
    },
  };
}

for (const [runId, fixture] of [
  ['40413173161', originalFixture],
  ['40428329193', replayFixture],
]) {
  test(`all exact identities match the reviewed resolution (${runId})`, () => {
    const { resolution, context } = fixture();
    assert.equal(matchesFailedNoWriteResolution(resolution, context), true);
    assert.equal(isResolvedFailedNoWrite(context), true);
  });

  test(`legacy baseline keys refuse even when every split baseline matches (${runId})`, () => {
    const { resolution, context } = fixture();
    // The split predicates all pass here; only the legacy-key predicate can refuse.
    const legacy = {
      ...resolution,
      baselineDeploymentId: RECEIPT_BASELINE.deployment,
      baselineVersionId: RECEIPT_BASELINE.version,
    };
    assert.equal(matchesFailedNoWriteResolution(legacy, context), false);
  });

  const cases = [
    [
      'outcome',
      ({ resolution: r }) => {
        r.outcome = 'accepted';
      },
    ],
    [
      'repository',
      ({ context: c }) => {
        c.env.GITHUB_REPOSITORY = 'other/repo';
      },
    ],
    [
      'original-run exclusion',
      ({ context: c }) => {
        c.env.GITHUB_RUN_ID = String(c.run.id);
      },
    ],
    [
      'requested app',
      ({ context: c }) => {
        c.app = 'mail';
        c.receipt.app = 'mail';
      },
    ],
    [
      'receipt app',
      ({ context: c }) => {
        c.receipt.app = 'mail';
      },
    ],
    [
      'requested Worker',
      ({ context: c }) => {
        c.worker = 'tuturuuu-mail';
        c.receipt.worker = 'tuturuuu-mail';
      },
    ],
    [
      'receipt Worker',
      ({ context: c }) => {
        c.receipt.worker = 'tuturuuu-mail';
      },
    ],
    [
      'run id',
      ({ context: c }) => {
        c.run.id = 40413173160;
      },
    ],
    [
      'job run id',
      ({ context: c }) => {
        c.job.run_id = 40413173160;
      },
    ],
    [
      'receipt run id',
      ({ context: c }) => {
        c.receipt.runId = '40413173160';
      },
    ],
    [
      'job attempt',
      ({ context: c }) => {
        c.job.run_attempt = 2;
      },
    ],
    [
      'receipt attempt',
      ({ context: c }) => {
        c.receipt.runAttempt = '2';
      },
    ],
    [
      'run SHA',
      ({ context: c }) => {
        c.run.head_sha = 'b'.repeat(40);
      },
    ],
    [
      'receipt SHA',
      ({ context: c }) => {
        c.receipt.sha = 'b'.repeat(40);
      },
    ],
    [
      'receipt digest',
      ({ context: c }) => {
        c.receipt.digest = 'b'.repeat(64);
      },
    ],
    [
      'pending state',
      ({ context: c }) => {
        c.receipt.state = 'failed';
      },
    ],
    [
      'absent versionId',
      ({ context: c }) => {
        c.receipt.versionId = null;
      },
    ],
    [
      'live (current) deployment id',
      ({ context: c }) => {
        c.rollback.id = '22222222-2222-2222-2222-222222222222';
      },
    ],
    [
      'receipt deployment id',
      ({ context: c }) => {
        c.receipt.rollback.id = '22222222-2222-2222-2222-222222222222';
      },
    ],
    [
      'live (current) version split',
      ({ context: c }) => {
        c.rollback.versions[0].percentage = 99;
      },
    ],
    [
      'receipt version split',
      ({ context: c }) => {
        c.receipt.rollback.versions[0].percentage = 99;
      },
    ],
    [
      'legacy baseline key present',
      ({ resolution: r }) => {
        r.baselineDeploymentId = RECEIPT_BASELINE.deployment;
        r.baselineVersionId = RECEIPT_BASELINE.version;
      },
    ],
  ];
  for (const [index, [name, mutate]] of cases.entries())
    test(`predicate ${String(index + 1).padStart(2, '0')}: ${name} refuses (${runId})`, () => {
      const p = fixture();
      mutate(p);
      assert.equal(
        matchesFailedNoWriteResolution(p.resolution, p.context),
        false
      );
    });
}

for (const record of reviewedRecords.filter(
  (r) =>
    r.outcome === 'failed-no-write' &&
    Object.hasOwn(r, 'currentBaselineDeploymentId')
))
  test(`reviewed split record admits only its own identities (${record.runId} ${record.sha.slice(0, 8)})`, () => {
    const context = contextFor(record);
    assert.equal(matchesFailedNoWriteResolution(record, context), true);
    assert.equal(
      matchesFailedNoWriteResolution(record, {
        ...context,
        run: { ...context.run, head_sha: 'b'.repeat(40) },
      }),
      false
    );
  });

for (const record of reviewedRecords.filter(
  (r) => !Object.hasOwn(r, 'currentBaselineDeploymentId')
))
  test(`legacy reviewed record with a stale baseline refuses (${record.runId} ${record.sha.slice(0, 8)})`, () => {
    const stale = {
      ...record,
      receiptBaselineDeploymentId: record.baselineDeploymentId,
      receiptBaselineVersionId: record.baselineVersionId,
      currentBaselineDeploymentId: record.baselineDeploymentId,
      currentBaselineVersionId: record.baselineVersionId,
    };
    assert.equal(
      matchesFailedNoWriteResolution(record, contextFor(stale)),
      false
    );
  });

for (const record of reviewedRecords.filter(
  (r) => r.outcome === 'failed-no-write' && r.app === 'calendar'
)) {
  test(`hosted version carrying a resolved SHA refuses (${record.runId} ${record.sha.slice(0, 8)})`, () => {
    assert.throws(
      () =>
        assertResolvedVersionsAbsent({
          app: 'calendar',
          versions: [{ annotations: { 'workers/message': record.sha } }],
        }),
      /owner reconciliation required/u
    );
  });

  test(`hosted version carrying a resolved digest refuses (${record.runId} ${record.digest.slice(0, 8)})`, () => {
    assert.throws(
      () =>
        assertResolvedVersionsAbsent({
          app: 'calendar',
          versions: [{ annotations: { 'workers/tag': record.digest } }],
        }),
      /owner reconciliation required/u
    );
  });
}

test('the live Calendar version is not a resolved identity', () => {
  assert.doesNotThrow(() =>
    assertResolvedVersionsAbsent({
      app: 'calendar',
      versions: [
        {
          annotations: {
            'workers/message': 'fc1b211e61584277daa83895ab3a61718e091a19',
          },
        },
      ],
    })
  );
});

test('R8: receipt and live baselines accept mixed-case UUIDs', () => {
  const { resolution, context } = originalFixture();
  for (const baseline of [context.receipt.rollback, context.rollback]) {
    baseline.id = baseline.id.toUpperCase();
    baseline.versions[0].version_id = baseline.versions[0].version_id.toUpperCase();
  }
  assert.equal(matchesFailedNoWriteResolution(resolution, context), true);
});

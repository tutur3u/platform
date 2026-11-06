import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isResolvedFailedNoWrite,
  matchesFailedNoWriteResolution,
} from './wave1-native-production-resolution.mjs';

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
    baselineDeploymentId: 'e77a63b0-ec5d-46bf-bb89-b1829066ba90',
    baselineVersionId: '1a7cbbd0-d3a2-415f-8b75-890a1412c3f0',
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
        id: 'e77a63b0-ec5d-46bf-bb89-b1829066ba90',
        versions: [
          {
            version_id: '1a7cbbd0-d3a2-415f-8b75-890a1412c3f0',
            percentage: 100,
          },
        ],
      },
    },
    rollback: {
      id: 'e77a63b0-ec5d-46bf-bb89-b1829066ba90',
      versions: [
        { version_id: '1a7cbbd0-d3a2-415f-8b75-890a1412c3f0', percentage: 100 },
      ],
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
for (const [runId, fixture] of [
  ['40413173161', originalFixture],
  ['40428329193', replayFixture],
]) {
  test(`all exact identities match the reviewed resolution (${runId})`, () => {
    const { resolution, context } = fixture();
    assert.equal(matchesFailedNoWriteResolution(resolution, context), true);
    assert.equal(isResolvedFailedNoWrite(context), true);
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
      'current deployment id',
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
      'current version split',
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

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoEarlierUpload,
  uploadStepName,
} from './wave1-native-production-history.mjs';

const resolution = {
  app: 'calendar',
  worker: 'tuturuuu-calendar',
  runId: '40413173161',
  runAttempt: '1',
  sha: 'ac8beee09e9700b453a55e193db5957985e01956',
  digest: '2116459bf121f09a7a714889d13d291a9823b451285747602a67eb0e50435b97',
  baselineDeploymentId: 'e77a63b0-ec5d-46bf-bb89-b1829066ba90',
  baselineVersionId: '1a7cbbd0-d3a2-415f-8b75-890a1412c3f0',
};
const currentSha = 'a'.repeat(40);
function fixture() {
  const originalId = Number(resolution.runId);
  const currentId = originalId + 2;
  const baseline = {
    id: resolution.baselineDeploymentId,
    versions: [{ version_id: resolution.baselineVersionId, percentage: 100 }],
  };
  const receipt = {
    app: resolution.app,
    worker: resolution.worker,
    sha: resolution.sha,
    digest: resolution.digest,
    runId: resolution.runId,
    runAttempt: resolution.runAttempt,
    state: 'pending',
    rollback: structuredClone(baseline),
  };
  const state = {
    originalId,
    currentId,
    receipt,
    baseline,
    pendingId: null,
  };
  const job = (id, attempt) => ({
    name: 'publish-calendar',
    run_id: id,
    run_attempt: attempt,
    status: 'completed',
    conclusion: 'failure',
    steps: [
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-10-26T22:38:01Z',
      },
    ],
  });
  const fetcher = async (url) => {
    const original = state.originalId;
    const extra =
      state.pendingId !== null
        ? [
            {
              id: state.pendingId,
              head_sha: 'b'.repeat(40),
              head_branch: 'production',
            },
          ]
        : [];
    if (url.includes('/jobs?')) {
      const id = Number(/\/runs\/(\d+)\//u.exec(url)[1]);
      return Response.json({
        total_count: 1,
        jobs: [
          Object.assign(
            job(id, id === original ? (state.jobAttempt ?? 1) : 1),
            id === original ? (state.jobOverride ?? {}) : {}
          ),
        ],
      });
    }
    if (url.includes('/artifacts?')) {
      const isOriginal = url.includes(`/runs/${original}/`);
      const id = isOriginal ? original : state.pendingId;
      const sha = isOriginal ? resolution.sha : 'b'.repeat(40);
      const attempt = isOriginal ? String(state.artifactAttempt ?? 1) : '1';
      return Response.json({
        total_count: 1,
        artifacts: [
          {
            id: isOriginal ? 9 : 10,
            expired: false,
            name: `wave1-calendar-production-publication-${sha}-${id}-${attempt}`,
          },
        ],
      });
    }
    const runs = [
      { id: currentId, head_sha: currentSha, head_branch: 'production' },
      ...extra,
      { id: original, head_sha: resolution.sha, head_branch: 'production' },
    ];
    return Response.json({ total_count: runs.length, workflow_runs: runs });
  };
  return {
    state,
    run: () =>
      assertNoEarlierUpload({
        env: {
          GITHUB_REPOSITORY: 'tutur3u/platform',
          GITHUB_TOKEN: 'fixture',
          GITHUB_RUN_ID: String(currentId),
          GITHUB_RUN_ATTEMPT: '1',
        },
        sha: currentSha,
        app: 'calendar',
        worker: 'tuturuuu-calendar',
        rollback: state.baseline,
        fetcher,
        readReceipt: async ({ url }) =>
          url.includes('/artifacts/9/')
            ? state.receipt
            : {
                ...state.receipt,
                runId: String(state.pendingId),
                sha: 'b'.repeat(40),
              },
      }),
  };
}

test('reviewed failed-no-write resolution preserves the immutable pending receipt', async () => {
  const p = fixture();
  const before = JSON.stringify(p.state.receipt);
  await p.run();
  assert.equal(JSON.stringify(p.state.receipt), before);
  assert.equal(p.state.receipt.state, 'pending');
});

for (const [name, mutate] of [
  [
    'job and receipt disagree about the attempt',
    (p) => {
      p.state.jobAttempt = 2;
    },
  ],
  [
    'artifact and job disagree about the attempt',
    (p) => {
      p.state.artifactAttempt = 2;
    },
  ],
  [
    'job and run disagree about the id',
    (p) => {
      p.state.jobOverride = { run_id: p.state.originalId - 1 };
    },
  ],
  [
    'attempt 2',
    (p) => {
      p.state.receipt.runAttempt = '2';
    },
  ],
  [
    'different digest',
    (p) => {
      p.state.receipt.digest = 'c'.repeat(64);
    },
  ],
  [
    'different run',
    (p) => {
      p.state.receipt.runId = String(p.state.originalId + 9);
    },
  ],
  [
    'different SHA',
    (p) => {
      p.state.receipt.sha = 'd'.repeat(40);
    },
  ],
  [
    'different active baseline',
    (p) => {
      p.state.baseline.versions[0].version_id =
        '22222222-2222-2222-2222-222222222222';
    },
  ],
  [
    'different receipt baseline',
    (p) => {
      p.state.receipt.rollback.versions[0].version_id =
        '22222222-2222-2222-2222-222222222222';
    },
  ],
  [
    'an uploaded version',
    (p) => {
      p.state.receipt.versionId = resolution.baselineVersionId;
    },
  ],
  [
    'second pending replay',
    (p) => {
      p.state.pendingId = p.state.originalId + 1;
    },
  ],
  [
    'older pending attempt',
    (p) => {
      p.state.pendingId = p.state.originalId - 1;
    },
  ],
])
  test(`${name} stays fenced`, async () => {
    const p = fixture();
    mutate(p);
    await assert.rejects(p.run(), /never replay|Malformed publication job/u);
  });

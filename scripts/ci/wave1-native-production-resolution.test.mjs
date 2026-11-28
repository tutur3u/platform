import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertNoEarlierUpload,
  uploadStepName,
} from './wave1-native-production-history.mjs';

// The reviewed split-baseline records only; legacy entries cannot admit any receipt.
const resolutions = JSON.parse(
  readFileSync(
    new URL('./wave1-native-production-resolutions.json', import.meta.url),
    'utf8'
  )
).filter((record) => Object.hasOwn(record, 'currentBaselineDeploymentId'));
const currentSha = 'a'.repeat(40);
function fixture(resolution) {
  const originalId = Number(resolution.runId);
  const currentId = originalId + 2;
  // Live rollback at preflight (currentBaseline*) and the receipt's own captured rollback.
  const baseline = {
    id: resolution.currentBaselineDeploymentId,
    versions: [
      { version_id: resolution.currentBaselineVersionId, percentage: 100 },
    ],
  };
  const receiptBaseline = {
    id: resolution.receiptBaselineDeploymentId,
    versions: [
      { version_id: resolution.receiptBaselineVersionId, percentage: 100 },
    ],
  };
  const receipt = {
    app: resolution.app,
    worker: resolution.worker,
    sha: resolution.sha,
    digest: resolution.digest,
    runId: resolution.runId,
    runAttempt: resolution.runAttempt,
    state: 'pending',
    rollback: structuredClone(receiptBaseline),
  };
  const state = {
    originalId,
    originalSha: resolution.sha,
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
              run_attempt: 1,
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
      const sha = isOriginal ? state.originalSha : 'b'.repeat(40);
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
      {
        id: currentId,
        head_sha: currentSha,
        head_branch: 'production',
        run_attempt: 1,
      },
      ...extra,
      {
        id: original,
        head_sha: state.originalSha,
        head_branch: 'production',
        run_attempt: 1,
      },
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

for (const resolution of resolutions) {
  test(`reviewed failed-no-write resolution preserves the immutable pending receipt (${resolution.runId})`, async () => {
    const p = fixture(resolution);
    const before = JSON.stringify(p.state.receipt);
    await p.run();
    assert.equal(JSON.stringify(p.state.receipt), before);
    assert.equal(p.state.receipt.state, 'pending');
  });

  for (const [name, mutate, rejection] of [
    [
      'job and receipt disagree about the attempt',
      (p) => {
        p.state.jobAttempt = 2;
      },
      /Earlier production upload started or is unknown/u,
    ],
    [
      'artifact and job disagree about the attempt',
      (p) => {
        p.state.artifactAttempt = 2;
      },
      /Earlier production upload started or is unknown/u,
    ],
    [
      'job and run disagree about the id',
      (p) => {
        p.state.jobOverride = { run_id: p.state.originalId - 1 };
      },
      /Malformed publication job run/u,
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
      'unreviewed run across the job, artifact, and receipt',
      (p) => {
        p.state.originalId -= 100;
        p.state.receipt.runId = String(p.state.originalId);
      },
    ],
    [
      'unreviewed attempt across the job, artifact, and receipt',
      (p) => {
        p.state.jobAttempt = 2;
        p.state.artifactAttempt = 2;
        p.state.receipt.runAttempt = '2';
      },
    ],
    [
      'unreviewed SHA across the run, artifact, and receipt',
      (p) => {
        p.state.originalSha = 'd'.repeat(40);
        p.state.receipt.sha = p.state.originalSha;
      },
    ],
    [
      'October receipt baseline also used as the live baseline',
      (p) => {
        p.state.baseline = structuredClone(p.state.receipt.rollback);
      },
    ],
    [
      'live baseline also used as the receipt baseline',
      (p) => {
        p.state.receipt.rollback = structuredClone(p.state.baseline);
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
        p.state.receipt.versionId = resolution.receiptBaselineVersionId;
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
    test(`${name} stays fenced (${resolution.runId})`, async () => {
      const p = fixture(resolution);
      mutate(p);
      await assert.rejects(
        p.run(),
        rejection ?? /Earlier upload is not accepted; never replay/u
      );
    });
}

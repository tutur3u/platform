import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  assertNoEarlierUpload,
  isPublicationJob,
  plannerPublicationSince,
  publicationReceipt,
  publicationRunSources,
  uploadNeverStarted,
  uploadStepName,
} from './wave1-native-production-history.mjs';

const sha = 'a'.repeat(40);
const earlierSha = 'b'.repeat(40);
const versionId = '11111111-1111-1111-1111-111111111111';
function fixture() {
  const env = {
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_TOKEN: 'fixture',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
  };
  const receipt = {
    app: 'calendar',
    sha: earlierSha,
    digest: 'c'.repeat(64),
    worker: 'tuturuuu-calendar',
    runId: '122',
    runAttempt: '1',
    versionId,
    state: 'accepted-private',
  };
  const current = {
    name: 'publish-calendar',
    run_id: 123,
    run_attempt: 2,
    status: 'in_progress',
    steps: [{ name: uploadStepName, status: 'in_progress' }],
  };
  const previous = {
    name: 'publish-calendar',
    run_id: 122,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    steps: [
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-27T00:00:00Z',
      },
    ],
  };
  const state = {
    current,
    previous,
    receipt,
    artifact: true,
    expired: false,
    reads: 0,
  };
  const fetcher = async (url) => {
    if (url.includes('/jobs?')) {
      const jobs = url.includes('/123/') ? [current] : [previous];
      return Response.json({ total_count: jobs.length, jobs });
    }
    if (url.includes('/artifacts?'))
      return Response.json({
        total_count: state.artifact ? 1 : 0,
        artifacts: state.artifact
          ? [
              {
                id: 9,
                name: `wave1-calendar-production-publication-${earlierSha}-122-1`,
                expired: state.expired,
              },
            ]
          : [],
      });
    return Response.json({
      total_count: 2,
      workflow_runs: [
        { id: 123, head_sha: sha, head_branch: 'production' },
        { id: 122, head_sha: earlierSha, head_branch: 'production' },
      ],
    });
  };
  const fixtureState = {
    state,
    fetcher,
    run: () =>
      assertNoEarlierUpload({
        env,
        sha,
        app: 'calendar',
        worker: 'tuturuuu-calendar',
        rollback: { versions: [{ version_id: versionId, percentage: 100 }] },
        fetcher: (url, options) => fixtureState.fetcher(url, options),
        readReceipt: async () => {
          state.reads++;
          return receipt;
        },
      }),
  };
  return fixtureState;
}

test('current in-progress attempt is ignored and accepted baseline closes earlier app history', async () => {
  const p = fixture();
  await p.run();
  assert.equal(p.state.reads, 1);
});
test('another app upload does not consume Calendar history', async () => {
  const p = fixture();
  p.state.previous.name = 'publish-mail';
  await p.run();
  assert.equal(p.state.reads, 0);
});
test('a read-only preflight refusal leaves upload skipped and permits a later source', async () => {
  const p = fixture();
  p.state.artifact = false;
  p.state.previous.steps[0] = {
    name: uploadStepName,
    conclusion: 'skipped',
    status: 'completed',
  };
  await p.run();
});
for (const [name, mutate] of [
  [
    'missing receipt',
    (p) => {
      p.state.artifact = false;
    },
  ],
  [
    'expired receipt',
    (p) => {
      p.state.expired = true;
    },
  ],
  [
    'pending receipt',
    (p) => {
      p.state.receipt.state = 'pending';
    },
  ],
  [
    'different Worker receipt',
    (p) => {
      p.state.receipt.worker = 'tuturuuu-mail';
    },
  ],
  [
    'different app receipt',
    (p) => {
      p.state.receipt.app = 'mail';
    },
  ],
  [
    'different source receipt',
    (p) => {
      p.state.receipt.sha = sha;
    },
  ],
  [
    'different attempt receipt',
    (p) => {
      p.state.receipt.runAttempt = '2';
    },
  ],
  [
    'different rollback version',
    (p) => {
      p.state.receipt.versionId = '22222222-2222-2222-2222-222222222222';
    },
  ],
  [
    'unknown earlier upload step',
    (p) => {
      p.state.previous.steps = [];
    },
  ],
])
  test(`${name} cannot clear an earlier upload`, async () => {
    const p = fixture();
    mutate(p);
    await assert.rejects(p.run());
  });

test('receipt archive is bounded and storage request receives no GitHub credential', async () => {
  const payload = { state: 'accepted-private', versionId };
  const zip = execFileSync('python3', [
    '-I',
    '-c',
    `import io,sys,zipfile
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:z.writestr('calendar-production-publication.json',${JSON.stringify(JSON.stringify(payload))})
sys.stdout.buffer.write(b.getvalue())`,
  ]);
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.equal(options.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://fixture.blob.core.windows.net/archive' },
      });
    }
    assert.equal(url, 'https://fixture.blob.core.windows.net/archive');
    assert.deepEqual(options.headers, {});
    return new Response(zip);
  };
  assert.deepEqual(
    await publicationReceipt({
      url: 'https://api.github.com/artifact/zip',
      env: { GITHUB_TOKEN: 'fixture' },
      app: 'calendar',
      fetcher,
    }),
    payload
  );
  assert.equal(calls, 2);
});
for (const location of [
  'https://attacker.example/archive',
  'http://fixture.blob.core.windows.net/archive',
  'https://user:pass@fixture.blob.core.windows.net/archive',
])
  test('receipt download rejects untrusted storage URL', async () => {
    let calls = 0;
    await assert.rejects(
      publicationReceipt({
        url: 'https://api.github.com/artifact/zip',
        env: { GITHUB_TOKEN: 'fixture' },
        app: 'calendar',
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 302, headers: { location } });
        },
      })
    );
    assert.equal(calls, 1);
  });

test('oversized receipt download is refused before decoding', async () => {
  let calls = 0;
  await assert.rejects(
    publicationReceipt({
      url: 'https://api.github.com/artifact/zip',
      env: { GITHUB_TOKEN: 'fixture' },
      app: 'calendar',
      fetcher: async () =>
        ++calls === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location: 'https://fixture.blob.core.windows.net/archive',
              },
            })
          : new Response(new Uint8Array(1024 * 1024 + 1)),
    }),
    /exceeds limit/
  );
});

test('a planner-called publish job is recognised by its nested name', () => {
  assert.ok(isPublicationJob('publish-calendar', 'calendar'));
  assert.ok(isPublicationJob('publish', 'calendar'));
  assert.ok(
    isPublicationJob(
      'deploy-calendar-native / native-publish-production / publish-calendar',
      'calendar'
    )
  );
  assert.ok(
    !isPublicationJob(
      'deploy-mail-native / native-publish-production / publish-mail',
      'calendar'
    )
  );
  assert.ok(!isPublicationJob('deploy-colab-cloudflare / publish', 'calendar'));
});

test('history reads manual dispatches and planner runs since the planner gained the publisher', async () => {
  const p = fixture();
  p.state.previous.name =
    'deploy-calendar-native / native-publish-production / publish-calendar';
  const urls = [];
  const fetcher = p.fetcher;
  p.fetcher = async (url, options) => {
    urls.push(url);
    return fetcher(url, options);
  };
  await p.run();
  assert.equal(p.state.reads, 1);
  const runLists = urls.filter((url) => url.includes('/runs?'));
  assert.deepEqual(
    runLists.map((url) => /workflows\/([^/]+)\/runs/.exec(url)[1]).sort(),
    publicationRunSources.map(({ workflow }) => workflow).sort()
  );
  assert.ok(
    runLists.some(
      (url) =>
        url.includes('vercel-production.yaml') &&
        url.includes(
          `created=${encodeURIComponent(`>=${plannerPublicationSince}`)}`
        )
    )
  );
  assert.ok(
    runLists.some(
      (url) =>
        url.includes('wave1-native-production.yaml') &&
        url.includes('event=workflow_dispatch')
    )
  );
});

test('history that never reaches an accepted upload within its page bound fails closed', async () => {
  const p = fixture();
  p.state.previous.name = 'publish-mail';
  p.fetcher = async (url) => {
    if (url.includes('/jobs?'))
      return Response.json({ total_count: 0, jobs: [] });
    const page = Number(/[?&]page=(\d+)/.exec(url)[1]);
    const first = 100_000 - page * 100;
    return Response.json({
      total_count: 5000,
      workflow_runs: Array.from({ length: 100 }, (_, index) => ({
        id: page === 1 && index === 0 ? 123 : first - index,
        head_sha: page === 1 && index === 0 ? sha : earlierSha,
        head_branch: 'production',
      })),
    });
  };
  await assert.rejects(p.run(), /Unbounded or incomplete publication history/);
});

// The shape of run 45609260589: a manual Mail dispatch whose two attempts
// both failed at the read-only preflight, so the upload step was skipped
// (GitHub still stamps started_at on skipped steps) and no receipt exists.
function preflightRefusal(attempt) {
  return {
    name: 'publish-mail',
    run_id: 45609260589,
    run_attempt: attempt,
    status: 'completed',
    conclusion: 'failure',
    steps: [
      {
        name: 'Read-only production preflight',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-11-25T12:33:41Z',
      },
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'skipped',
        started_at: '2026-11-25T12:33:47Z',
      },
    ],
  };
}

function mailHistory({ failedJobs, receiptState = 'accepted-private' }) {
  const currentRun = 45700000000;
  const failedRun = 45609260589;
  const acceptedRun = 44720765059;
  const accepted = {
    name: 'publish-mail',
    run_id: acceptedRun,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    steps: [
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-20T10:50:00Z',
      },
    ],
  };
  const reads = [];
  const fetcher = async (url) => {
    if (url.includes('/jobs?')) {
      const id = Number(/\/runs\/(\d+)\//u.exec(url)[1]);
      const jobs =
        id === failedRun ? failedJobs : id === acceptedRun ? [accepted] : [];
      return Response.json({ total_count: jobs.length, jobs });
    }
    if (url.includes('/artifacts?')) {
      reads.push(url);
      const id = Number(/\/runs\/(\d+)\//u.exec(url)[1]);
      return Response.json(
        id === acceptedRun
          ? {
              total_count: 1,
              artifacts: [
                {
                  id: 7,
                  expired: false,
                  name: `wave1-mail-production-publication-${earlierSha}-${acceptedRun}-1`,
                },
              ],
            }
          : { total_count: 0, artifacts: [] }
      );
    }
    const runs = url.includes('wave1-native-production.yaml')
      ? [
          {
            id: failedRun,
            head_sha: 'c'.repeat(40),
            head_branch: 'production',
          },
          { id: acceptedRun, head_sha: earlierSha, head_branch: 'production' },
        ]
      : [{ id: currentRun, head_sha: sha, head_branch: 'production' }];
    return Response.json({ total_count: runs.length, workflow_runs: runs });
  };
  return {
    reads,
    run: () =>
      assertNoEarlierUpload({
        env: {
          GITHUB_REPOSITORY: 'tutur3u/platform',
          GITHUB_TOKEN: 'fixture',
          GITHUB_RUN_ID: String(currentRun),
          GITHUB_RUN_ATTEMPT: '1',
        },
        sha,
        app: 'mail',
        worker: 'tuturuuu-mail',
        rollback: { versions: [{ version_id: versionId, percentage: 100 }] },
        fetcher,
        readReceipt: async () => ({
          app: 'mail',
          worker: 'tuturuuu-mail',
          sha: earlierSha,
          digest: 'c'.repeat(64),
          runId: String(acceptedRun),
          runAttempt: '1',
          versionId,
          state: receiptState,
        }),
      }),
  };
}

test('a failed manual dispatch that never uploaded does not poison the walk', async () => {
  const history = mailHistory({
    failedJobs: [preflightRefusal(2), preflightRefusal(1)],
  });
  await history.run();
  // Only the accepted baseline's receipt is read; the refusal has none.
  assert.equal(history.reads.length, 1);
  assert.match(history.reads[0], /\/runs\/44720765059\//);
});

test('a job cancelled before any runner picked it up is ignored', async () => {
  const history = mailHistory({
    failedJobs: [
      {
        ...preflightRefusal(1),
        conclusion: 'cancelled',
        runner_id: null,
        steps: [],
      },
    ],
  });
  await history.run();
  assert.equal(history.reads.length, 1);
});

test('a failed job without steps or runner evidence stays unknown', async () => {
  await assert.rejects(
    mailHistory({
      failedJobs: [{ ...preflightRefusal(1), steps: [] }],
    }).run(),
    /Unknown earlier upload step/
  );
});

test('a failed attempt whose upload started still blocks without a receipt', async () => {
  const started = preflightRefusal(1);
  started.steps[1] = {
    name: uploadStepName,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-11-25T12:33:47Z',
  };
  await assert.rejects(
    mailHistory({ failedJobs: [started] }).run(),
    /never replay/
  );
});

test('uploadNeverStarted keeps unknown and started uploads blocking', () => {
  assert.equal(uploadNeverStarted(preflightRefusal(1)), true);
  assert.throws(
    () => uploadNeverStarted({ conclusion: 'success', steps: [] }),
    /Unknown earlier upload step/
  );
  assert.equal(
    uploadNeverStarted({
      conclusion: 'failure',
      steps: [{ name: uploadStepName, status: 'in_progress', started_at: 'x' }],
    }),
    false
  );
});

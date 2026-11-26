import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyReader,
  maxRunAttempts,
  originalExecutions,
  readTries,
  runJobs,
} from './wave1-native-history-reads.mjs';
import {
  assertNoEarlierUpload,
  maxRunsWalked,
  uploadStepName,
} from './wave1-native-production-history.mjs';

const sha = 'a'.repeat(40);
const earlierSha = 'b'.repeat(40);
const versionId = '11111111-1111-1111-1111-111111111111';
const currentRun = 200;
const earlierRun = 100;

// A finished publish job as GitHub lists it. Attempt 1 ran it, so its record is
// older than its end. A later attempt lists a copy with the same runner, times
// and steps under a new id, with a record made after the job ended.
function published(attempt, overrides = {}) {
  return {
    id: 1000 + attempt,
    name: 'deploy-mail-native / native-publish-production / publish-mail',
    run_id: earlierRun,
    run_attempt: attempt,
    head_sha: earlierSha,
    created_at:
      attempt === 1 ? '2026-11-25T23:35:16Z' : `2026-11-26T0${attempt}:22:29Z`,
    runner_id: 77,
    runner_name: 'GitHub Actions 77',
    labels: ['ubuntu-latest'],
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-11-25T23:35:50Z',
    completed_at: '2026-11-25T23:39:08Z',
    steps: [
      {
        name: uploadStepName,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-25T23:37:00Z',
        completed_at: '2026-11-25T23:38:00Z',
      },
    ],
    ...overrides,
  };
}

const filler = (attempt, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: attempt * 10_000 + index,
    name: `deploy-other / job-${index}`,
    run_id: earlierRun,
    run_attempt: attempt,
    status: 'completed',
    conclusion: 'success',
    steps: [],
  }));

const badGateway = () => new Response('{}', { status: 502 });

// GitHub's behaviour on a run that reruns have grown: the all-attempts listing
// and any large page answer 502, while small per-attempt pages answer.
function github({
  attempts = 4,
  jobsOf = (attempt) => [...filler(attempt, 58), published(attempt)],
  receiptAttempt = 1,
  intercept,
} = {}) {
  const requests = [];
  const sleeps = [];
  let receipts = 0;
  const fetcher = async (url, options) => {
    requests.push(url);
    const forced = await intercept?.(url, options, requests);
    if (forced) return forced;
    if (url.includes('filter=all')) return badGateway();
    if (url.includes('/jobs?')) {
      const size = Number(/per_page=(\d+)/u.exec(url)[1]);
      if (size > 30) return badGateway();
      const [, id, attempt] = /\/runs\/(\d+)\/attempts\/(\d+)\//u.exec(url);
      const page = Number(/[?&]page=(\d+)/u.exec(url)[1]);
      const jobs =
        Number(id) === currentRun
          ? [
              {
                id: 1,
                name: 'publish-mail',
                run_id: currentRun,
                run_attempt: 1,
                status: 'in_progress',
                steps: [{ name: uploadStepName, status: 'in_progress' }],
              },
            ]
          : jobsOf(Number(attempt));
      return Response.json({
        total_count: jobs.length,
        jobs: jobs.slice((page - 1) * size, page * size),
      });
    }
    if (url.includes('/artifacts?')) {
      const name = `wave1-mail-production-publication-${earlierSha}-${earlierRun}-${receiptAttempt}`;
      const matches = url.includes(`name=${name}&`);
      return Response.json({
        total_count: matches ? 1 : 0,
        artifacts: matches ? [{ id: 9, name, expired: false }] : [],
      });
    }
    const runs = url.includes('wave1-native-production.yaml')
      ? []
      : [
          {
            id: currentRun,
            run_attempt: 1,
            head_sha: sha,
            head_branch: 'production',
          },
          {
            id: earlierRun,
            run_attempt: attempts,
            head_sha: earlierSha,
            head_branch: 'production',
          },
        ];
    return Response.json({ total_count: runs.length, workflow_runs: runs });
  };
  return {
    requests,
    sleeps,
    receiptReads: () => receipts,
    run: (readOptions = {}) =>
      assertNoEarlierUpload({
        env: {
          GITHUB_REPOSITORY: 'fixture/repo',
          GITHUB_TOKEN: 'fixture',
          GITHUB_RUN_ID: String(currentRun),
          GITHUB_RUN_ATTEMPT: '1',
        },
        sha,
        app: 'mail',
        worker: 'tuturuuu-mail',
        rollback: { versions: [{ version_id: versionId, percentage: 100 }] },
        fetcher,
        readOptions: {
          sleep: async (ms) => sleeps.push(ms),
          ...readOptions,
        },
        readReceipt: async () => {
          receipts += 1;
          return {
            app: 'mail',
            worker: 'tuturuuu-mail',
            sha: earlierSha,
            digest: 'c'.repeat(64),
            runId: String(earlierRun),
            runAttempt: String(receiptAttempt),
            versionId,
            state: 'accepted-private',
          };
        },
      }),
  };
}

const jobRequests = (history) =>
  history.requests.filter((url) => url.includes('/jobs?'));
const isEarlierJobs = (url) =>
  url.includes(`/runs/${earlierRun}/attempts/`) && url.includes('/jobs?');

test('a run whose large job pages answer 502 is read in small per-attempt pages', async () => {
  const history = github();
  const receipt = await history.run();
  assert.equal(receipt.versionId, versionId);
  assert.ok(
    jobRequests(history).every((url) =>
      /\/attempts\/\d+\/jobs\?per_page=30&page=\d+$/u.test(url)
    )
  );
  // 59 jobs take two pages in each of the four attempts.
  assert.equal(jobRequests(history).filter(isEarlierJobs).length, 8);
  assert.deepEqual(history.sleeps, []);
});

test('copies in later attempts use the receipt of the attempt that ran the job', async () => {
  const history = github({ attempts: 4, receiptAttempt: 1 });
  await history.run();
  const lookups = history.requests.filter((url) => url.includes('/artifacts?'));
  assert.equal(lookups.length, 1);
  assert.match(lookups[0], new RegExp(`-${earlierRun}-1&`, 'u'));
});

// A job that attempt 2 really ran again: its record is older than its end.
const ranAgain = (overrides = {}) =>
  published(2, {
    created_at: '2026-11-26T01:00:00Z',
    started_at: '2026-11-26T01:00:30Z',
    completed_at: '2026-11-26T01:03:00Z',
    ...overrides,
  });
const refusedForAttemptTwo = async (second) => {
  const history = github({
    attempts: 2,
    receiptAttempt: 1,
    jobsOf: (attempt) => [attempt === 1 ? published(1) : second],
  });
  await assert.rejects(history.run(), /owner reconciliation required/u);
  assert.equal(history.receiptReads(), 0);
  const lookups = history.requests.filter((url) => url.includes('/artifacts?'));
  assert.equal(lookups.length, 1);
  assert.match(lookups[0], new RegExp(`-${earlierRun}-2&`, 'u'));
};

test('a near-copy with a different step outcome stops the publish', async () => {
  const [step] = published(2).steps;
  await refusedForAttemptTwo(
    published(2, { steps: [{ ...step, conclusion: 'failure' }] })
  );
});

test('a near-copy that differs in any execution field stops the publish', async () => {
  const [step] = published(2).steps;
  for (const overrides of [
    { runner_id: 78 },
    { runner_name: 'GitHub Actions 78' },
    { started_at: '2026-11-25T23:35:51Z' },
    { completed_at: '2026-11-25T23:39:09Z' },
    { conclusion: 'failure' },
    { head_sha: sha },
    { labels: ['ubuntu-24.04'] },
    { steps: [{ ...step, completed_at: '2026-11-25T23:38:01Z' }] },
    { steps: [step, { ...step, name: 'Retain receipt' }] },
    { runner_name: null },
  ])
    await refusedForAttemptTwo(published(2, overrides));
});

test('identical fields on a record made before the job ended are not a copy', async () => {
  await refusedForAttemptTwo(
    published(2, { created_at: '2026-11-25T23:35:16Z' })
  );
  await refusedForAttemptTwo(published(2, { created_at: undefined }));
});

test('a copy of an earlier upload never hides a later real upload', async () => {
  const history = github({
    attempts: 3,
    receiptAttempt: 1,
    jobsOf: (attempt) => [
      attempt === 1
        ? published(1)
        : attempt === 2
          ? ranAgain()
          : // Attempt 3 carries attempt 2's upload over.
            ranAgain({ run_attempt: 3, created_at: '2026-11-26T02:00:00Z' }),
    ],
  });
  await assert.rejects(history.run(), /owner reconciliation required/u);
  assert.equal(history.receiptReads(), 0);
  const lookups = history.requests.filter((url) => url.includes('/artifacts?'));
  assert.match(lookups[0], new RegExp(`-${earlierRun}-2&`, 'u'));
});

test('copies are dropped only beside the execution that ran', () => {
  const attempts = (jobs) =>
    originalExecutions(jobs).map((job) => job.run_attempt);
  assert.deepEqual(attempts([published(3), published(1), published(2)]), [1]);
  // Copies without the record that ran them all stay.
  assert.deepEqual(attempts([published(2), published(3)]), [3, 2]);
  const unstarted = [1, 2].map((attempt) =>
    published(attempt, { runner_id: null, completed_at: null })
  );
  assert.deepEqual(attempts(unstarted), [2, 1]);
});

test(
  'a 502 that persists fails closed after the bounded tries',
  { timeout: 10_000 },
  async () => {
    const history = github({
      attempts: 1,
      intercept: (url) => (isEarlierJobs(url) ? badGateway() : undefined),
    });
    await assert.rejects(
      history.run(),
      /Required control-plane observation failed \(502\)/u
    );
    assert.equal(history.requests.filter(isEarlierJobs).length, readTries);
    assert.deepEqual(history.sleeps, [1000, 3000]);
    assert.equal(history.receiptReads(), 0);
  }
);

test('a transient 502 is retried and the walk then completes', async () => {
  let failed = false;
  const history = github({
    attempts: 1,
    intercept: (url) => {
      if (failed || !isEarlierJobs(url)) return undefined;
      failed = true;
      return badGateway();
    },
  });
  await history.run();
  assert.deepEqual(history.sleeps, [1000]);
  assert.equal(history.receiptReads(), 1);
});

test('a client error is not retried', async () => {
  const history = github({
    attempts: 1,
    intercept: (url) =>
      isEarlierJobs(url) ? new Response('{}', { status: 404 }) : undefined,
  });
  await assert.rejects(history.run(), /observation failed \(404\)/u);
  assert.equal(history.requests.filter(isEarlierJobs).length, 1);
});

test(
  'the total cap stops retries and fails closed',
  { timeout: 10_000 },
  async () => {
    const history = github({
      attempts: 1,
      intercept: (url, options) =>
        isEarlierJobs(url)
          ? new Promise((_, reject) => {
              const keepAlive = setTimeout(() => {}, 5000);
              options.signal.addEventListener('abort', () => {
                clearTimeout(keepAlive);
                reject(options.signal.reason);
              });
            })
          : undefined,
    });
    await assert.rejects(history.run({ capMs: 50 }), { name: 'TimeoutError' });
    assert.equal(history.requests.filter(isEarlierJobs).length, 1);
    assert.equal(history.receiptReads(), 0);
  }
);

test('an unknown or unbounded attempt count fails closed without reading jobs', async () => {
  for (const runAttempt of [undefined, 0, maxRunAttempts + 1]) {
    let reads = 0;
    await assert.rejects(
      runJobs({
        base: 'https://api.github.com/repos/o/r/actions',
        run: { id: 1, run_attempt: runAttempt },
        read: async () => {
          reads += 1;
          return { total_count: 0, jobs: [] };
        },
      }),
      /Unknown earlier upload status; never replay/u
    );
    assert.equal(reads, 0);
  }
});

// Planner pages of 100 runs that hold no upload for the app.
const emptyRunListing = (pageOf, total) => (url) => {
  if (url.includes('/jobs?') && !url.includes(`/runs/${currentRun}/`))
    return Response.json({ total_count: 0, jobs: [] });
  if (!url.includes('/workflows/vercel-production.yaml/')) return undefined;
  const page = Number(/[?&]page=(\d+)/u.exec(url)[1]);
  return Response.json({
    total_count: total,
    workflow_runs: Array.from({ length: 100 }, (_, index) => {
      const offset = (pageOf(page) - 1) * 100 + index;
      return {
        id: currentRun - offset,
        run_attempt: 1,
        head_sha: offset ? earlierSha : sha,
        head_branch: 'production',
      };
    }),
  });
};

test('the walk fails closed after its run bound', async () => {
  const history = github({
    intercept: emptyRunListing((page) => page, 100 + maxRunsWalked),
  });
  await assert.rejects(
    history.run(),
    /Unbounded or incomplete publication history/u
  );
  assert.equal(jobRequests(history).length, maxRunsWalked);
});

test('a page served twice never completes the history', async () => {
  const history = github({ intercept: emptyRunListing(() => 1, 200) });
  await assert.rejects(
    history.run(),
    /Unbounded or incomplete publication history/u
  );
});

// A live planner listing read by offset. `change` edits it after the first
// read of page 1, as a run being created or deleted mid-walk would.
function liveListing(change) {
  const runs = Array.from({ length: 101 }, (_, index) => ({
    id: currentRun - index,
    run_attempt: 1,
    head_sha: index ? earlierSha : sha,
    head_branch: 'production',
  }));
  let changed = false;
  return (url) => {
    if (url.includes('/jobs?') && !url.includes(`/runs/${currentRun}/`))
      return Response.json({ total_count: 0, jobs: [] });
    if (!url.includes('/workflows/vercel-production.yaml/')) return undefined;
    const page = Number(/[?&]page=(\d+)/u.exec(url)[1]);
    const body = {
      total_count: runs.length,
      workflow_runs: runs.slice((page - 1) * 100, page * 100),
    };
    if (!changed && page === 1) {
      changed = true;
      change(runs);
    }
    return Response.json(body);
  };
}
const created = {
  id: currentRun + 1,
  run_attempt: 1,
  head_sha: earlierSha,
  head_branch: 'production',
};
const lostARun = /Publication history lost a run during the walk/u;

test('a run deleted between pages stops the publish', async () => {
  // The unread run moves onto page 1 and page 2 comes back empty.
  const history = github({
    intercept: liveListing((runs) => runs.splice(40, 1)),
  });
  await assert.rejects(history.run(), lostARun);
  assert.equal(history.receiptReads(), 0);
});

test('a known run gone while the total holds stops the publish', async () => {
  const history = github({
    intercept: liveListing((runs) => {
      runs.splice(40, 1);
      runs.unshift(created);
    }),
  });
  await assert.rejects(history.run(), lostARun);
  assert.equal(history.receiptReads(), 0);
});

test('a run created between pages only shifts the pages', async () => {
  const history = github({
    intercept: liveListing((runs) => runs.unshift(created)),
  });
  // The walk reads on and ends at its own bound, not as a lost run.
  await assert.rejects(
    history.run(),
    /Unbounded or incomplete publication history/u
  );
  assert.equal(jobRequests(history).length, maxRunsWalked);
});

test('the reader sends the GitHub token and returns the body', async () => {
  let seen;
  const read = historyReader({
    env: { GITHUB_TOKEN: 'fixture' },
    fetcher: async (_url, options) => {
      seen = options.headers.Authorization;
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(await read('https://api.github.com/x'), { ok: true });
  assert.equal(seen, 'Bearer fixture');
});

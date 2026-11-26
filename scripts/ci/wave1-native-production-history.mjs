import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  historyReader,
  originalExecutions,
  runJobs,
} from './wave1-native-history-reads.mjs';
import { isResolvedFailedNoWrite } from './wave1-native-production-resolution.mjs';

export const uploadStepName = 'Upload once without attaching serving topology';
const limit = 1024 * 1024;

export async function publicationReceipt({ url, env, fetcher, app }) {
  const signal = AbortSignal.timeout(15_000);
  const first = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
    redirect: 'manual',
    signal,
  });
  assert.equal(first.status, 302, 'Receipt download did not redirect');
  const location = new URL(first.headers.get('location'));
  assert.ok(
    location.protocol === 'https:' &&
      !location.username &&
      !location.password &&
      /\.(?:blob\.core\.windows\.net|githubusercontent\.com)$/.test(
        location.hostname
      ),
    'Unexpected receipt storage host'
  );
  const response = await fetcher(location.href, {
    method: 'GET',
    headers: {},
    redirect: 'error',
    signal,
  });
  assert.equal(response.status, 200, 'Receipt download failed');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= limit, 'Receipt archive exceeds limit');
    chunks.push(chunk);
  }
  const decoded = execFileSync(
    'python3',
    [
      '-I',
      '-c',
      `
import io,json,sys,zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 names=z.namelist()
 assert names == [${JSON.stringify(`${app}-production-publication.json`)}]
 info=z.getinfo(names[0])
 assert info.file_size <= ${limit}
 print(z.read(names[0]).decode('utf-8'))
`,
    ],
    {
      input: Buffer.concat(chunks),
      timeout: 5000,
      maxBuffer: limit,
      env: { PATH: env.PATH ?? process.env.PATH },
    }
  );
  return JSON.parse(decoded);
}

// Production uploads come from manual dispatches of the publisher and from
// Production Deployment Planner runs that call it. Run ids grow across every
// workflow in a repository, so a merged newest-first walk meets the latest
// started upload before any older one. Planner runs created before the
// planner first called the publisher hold no upload job, so the walk skips
// them. A walk that needs more than maxPages of either source fails closed.
export const plannerPublicationSince = '2026-11-25T00:00:00Z';
export const publicationRunSources = [
  {
    workflow: 'wave1-native-production.yaml',
    filter: '&event=workflow_dispatch',
  },
  {
    workflow: 'vercel-production.yaml',
    filter: `&created=${encodeURIComponent(`>=${plannerPublicationSince}`)}`,
  },
];
const maxPages = 10;
// The walk ends at the newest proven upload. Reaching this many runs without
// one means the history cannot be proven, so it fails closed.
export const maxRunsWalked = 100;
const incompleteHistory = 'Unbounded or incomplete publication history';
const changedHistory =
  'Publication history lost a run during the walk; start a fresh preflight';

function runReader({ base, source, read }) {
  let page = 0;
  let seen = 0;
  let total;
  let firstTotal;
  let previousIds;
  const listed = new Set();
  let buffer = [];
  const readPage = async (number) => {
    const runs = await read(
      `${base}/workflows/${source.workflow}/runs?branch=production${source.filter}&per_page=100&page=${number}`
    );
    assert.ok(
      Array.isArray(runs.workflow_runs) &&
        Number.isSafeInteger(runs.total_count) &&
        runs.workflow_runs.length <= 100,
      incompleteHistory
    );
    return runs;
  };
  // Pages are read by offset, so a run that leaves the listing moves a run not
  // yet read onto a page already read. A shrinking total shows it. A deletion
  // offset by a new run keeps the total, so the page before is read again and
  // every run it listed must still be there or have moved to this page.
  const assertNothingLeft = async (runs) => {
    assert.ok(total === undefined || runs.total_count >= total, changedHistory);
    if (!previousIds) return;
    const again = await readPage(page - 1);
    assert.ok(again.total_count >= runs.total_count, changedHistory);
    const present = new Set(
      [...again.workflow_runs, ...runs.workflow_runs].map((run) => run.id)
    );
    assert.ok(
      previousIds.every((id) => present.has(id)),
      changedHistory
    );
  };
  return async function next() {
    if (!buffer.length) {
      if (total !== undefined && seen >= total) return undefined;
      page += 1;
      assert.ok(page <= maxPages, incompleteHistory);
      const runs = await readPage(page);
      await assertNothingLeft(runs);
      assert.ok(
        runs.workflow_runs.length > 0 || seen >= runs.total_count,
        incompleteHistory
      );
      previousIds = runs.workflow_runs.map((run) => run.id);
      total = runs.total_count;
      firstTotal ??= total;
      for (const run of runs.workflow_runs) listed.add(run.id);
      // A run created mid-walk shifts the pages: one run repeats and the total
      // grows with each new run. Any other repeat is not progress, so a page
      // served twice never completes the history.
      seen = listed.size + (total - firstTotal);
      buffer = [...runs.workflow_runs].sort((a, b) => b.id - a.id);
      if (!buffer.length) return undefined;
    }
    return buffer.shift();
  };
}

// Newest-first merge of every source, each run once.
async function* productionRuns(context) {
  const readers = publicationRunSources.map((source) =>
    runReader({ ...context, source })
  );
  const heads = await Promise.all(readers.map((next) => next()));
  let last = Number.POSITIVE_INFINITY;
  const seen = new Set();
  for (;;) {
    let index = -1;
    for (const [candidate, run] of heads.entries())
      if (run && (index < 0 || run.id > heads[index].id)) index = candidate;
    if (index < 0) return;
    const run = heads[index];
    heads[index] = await readers[index]();
    assert.ok(
      Number.isSafeInteger(run.id) && run.id > 0,
      'Malformed prior run identity'
    );
    // A page that shifts under a new run repeats a run already read; any
    // other run newer than the last one means the listing is out of order.
    if (seen.has(run.id)) continue;
    assert.ok(run.id < last, 'Publication history is out of order');
    seen.add(run.id);
    last = run.id;
    yield run;
  }
}

/**
 * True only when the job provably never started its upload step: GitHub
 * ended it without ever assigning a runner (runner_id null, no steps), or
 * the upload step itself was skipped or never left the queue, for example
 * after a failed read-only preflight in a manual dispatch. A job with no
 * step list for any other reason, or whose upload step started, stays
 * unknown and blocks.
 */
export function uploadNeverStarted(job) {
  const terminal = ['failure', 'cancelled', 'timed_out'].includes(
    job.conclusion
  );
  if (
    terminal &&
    job.runner_id === null &&
    Array.isArray(job.steps) &&
    job.steps.length === 0
  )
    return true;
  const step = job.steps?.find((entry) => entry.name === uploadStepName);
  assert.ok(step, 'Unknown earlier upload step; never replay');
  return (
    step.conclusion === 'skipped' ||
    (['queued', 'pending'].includes(step.status) && !step.started_at)
  );
}

// Terminal states in which the serving deployment is the recorded baseline:
// restored and confirmed, or never changed (a failed module compare stops
// before staging).
const restoredStates = new Set([
  'module-compare-failed',
  'module-mismatch',
  'stage-failed',
  'smoke-failed',
  'switch-failed',
  'rolled-back',
]);

function sameSplit(actual, expected) {
  const shape = (list) =>
    JSON.stringify(
      (list ?? [])
        .map(({ version_id, percentage }) => [version_id, percentage])
        .sort()
    );
  return shape(actual) === shape(expected);
}

// A planner run names the called job `<caller> / <workflow job> / publish-<app>`.
export function isPublicationJob(name, app) {
  return (
    typeof name === 'string' &&
    (name === `publish-${app}` ||
      name === 'publish' ||
      name.endsWith(` / publish-${app}`))
  );
}

export async function assertNoEarlierUpload({
  env,
  sha,
  app,
  worker,
  rollback,
  fetcher,
  readReceipt = publicationReceipt,
  readOptions,
}) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions`;
  const read = historyReader({ ...readOptions, env, fetcher });
  let walked = 0;
  let sawCurrent = false;
  const assertCurrentSeen = () =>
    assert.ok(sawCurrent, 'Current production run missing from history');
  for await (const run of productionRuns({ base, read })) {
    walked += 1;
    assert.ok(walked <= maxRunsWalked, incompleteHistory);
    if (String(run.id) === env.GITHUB_RUN_ID) {
      assert.ok(
        run.head_sha === sha && run.head_branch === 'production',
        'Current production run missing from history'
      );
      sawCurrent = true;
    }
    if (run.head_branch !== 'production') continue;
    const jobs = await runJobs({ base, run, read });
    const publishers = jobs.filter((job) => isPublicationJob(job.name, app));
    // The walk trusts job names only after it recognizes this attempt's own
    // publish job: a renamed caller or job would otherwise hide every
    // earlier upload.
    if (String(run.id) === env.GITHUB_RUN_ID)
      assert.ok(
        publishers.some(
          (job) => String(job.run_attempt) === env.GITHUB_RUN_ATTEMPT
        ),
        'This run has no recognized publish job; never trust the history walk'
      );
    for (const job of originalExecutions(publishers)) {
      assert.equal(job.run_id, run.id, 'Malformed publication job run');
      assert.ok(
        Number.isSafeInteger(job.run_attempt) && job.run_attempt > 0,
        'Unknown publication attempt'
      );
      if (
        String(job.run_id) === env.GITHUB_RUN_ID &&
        String(job.run_attempt) === env.GITHUB_RUN_ATTEMPT
      )
        continue;
      if (job.conclusion === 'skipped' || job.status === 'queued') continue;
      if (uploadNeverStarted(job)) continue;
      const name = `wave1-${app}-production-publication-${run.head_sha}-${run.id}-${job.run_attempt}`;
      const artifacts = await read(
        `${base}/runs/${run.id}/artifacts?name=${name}&per_page=100`
      );
      assert.ok(
        Array.isArray(artifacts.artifacts) &&
          artifacts.total_count < 100 &&
          artifacts.total_count === artifacts.artifacts.length,
        'Incomplete publication receipt inventory'
      );
      const receipts = artifacts.artifacts.filter(
        (artifact) => artifact.name === name && !artifact.expired
      );
      assert.equal(
        receipts.length,
        1,
        'Earlier production upload started or is unknown; owner reconciliation required, never replay'
      );
      assert.ok(Number.isSafeInteger(receipts[0].id) && receipts[0].id > 0);
      const receipt = await readReceipt({
        url: `${base}/artifacts/${receipts[0].id}/zip`,
        env,
        fetcher,
        app,
      });
      // A superseded attempt stopped in its read-only preflight because a
      // newer production SHA already served; it never reached the upload.
      if (receipt.state === 'superseded' && receipt.versionId === undefined)
        continue;
      // A failed stage, smoke, switch or health gate restored this baseline
      // and confirmed it; that run's own preflight already cleared
      // everything older. An unconfirmed restore is `uncertain` and blocks.
      if (restoredStates.has(receipt.state)) {
        assert.ok(
          sameSplit(receipt.rollback?.versions, rollback.versions),
          'Earlier rolled-back upload no longer matches the serving baseline; owner reconciliation required'
        );
        assertCurrentSeen();
        // The restored serving version, with the SHA that attempt proved for
        // it in its preflight, identifies the baseline for the next attempt.
        const [serving] = rollback.versions;
        return rollback.versions.length === 1 &&
          /^[a-f0-9]{40}$/.test(receipt.servingSha ?? '')
          ? { versionId: serving.version_id, sha: receipt.servingSha }
          : undefined;
      }
      if (
        isResolvedFailedNoWrite({
          env,
          app,
          worker,
          run,
          job,
          receipt,
          rollback,
        })
      )
        continue;
      assert.equal(
        receipt.state,
        'accepted-private',
        'Earlier upload is not accepted; never replay'
      );
      assert.equal(receipt.app, app);
      assert.equal(receipt.worker, worker);
      assert.equal(receipt.sha, run.head_sha);
      assert.equal(receipt.runId, String(run.id));
      assert.equal(receipt.runAttempt, String(job.run_attempt));
      assert.match(receipt.digest ?? '', /^[a-f0-9]{64}$/);
      assert.ok(
        rollback.versions.some(
          (version) => version.version_id === receipt.versionId
        ),
        'Earlier accepted version is not the rollback baseline; owner reconciliation required'
      );
      // This accepted baseline already cleared all older app history before
      // its upload; the caller uses it to prove the serving SHA.
      assertCurrentSeen();
      return receipt;
    }
  }
  assertCurrentSeen();
}

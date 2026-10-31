import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { isResolvedFailedNoWrite } from './wave1-native-production-resolution.mjs';
import { boundedJson } from './wave1-native-publish.mjs';

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

export async function assertNoEarlierUpload({
  env,
  sha,
  app,
  worker,
  rollback,
  fetcher,
  readReceipt = publicationReceipt,
}) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions`;
  const runs = await boundedJson(
    `${base}/workflows/wave1-native-production.yaml/runs?branch=production&event=workflow_dispatch&per_page=100`,
    env.GITHUB_TOKEN,
    fetcher
  );
  assert.ok(
    Array.isArray(runs.workflow_runs) &&
      runs.total_count < 100 &&
      runs.total_count === runs.workflow_runs.length,
    'Unbounded or incomplete publication history'
  );
  assert.ok(
    runs.workflow_runs.some(
      (run) =>
        String(run.id) === env.GITHUB_RUN_ID &&
        run.head_sha === sha &&
        run.head_branch === 'production'
    ),
    'Current production run missing from history'
  );
  const ordered = [...runs.workflow_runs].sort((a, b) => b.id - a.id);
  for (const run of ordered) {
    if (run.head_branch !== 'production') continue;
    assert.ok(
      Number.isSafeInteger(run.id) && run.id > 0,
      'Malformed prior run identity'
    );
    const jobs = await boundedJson(
      `${base}/runs/${run.id}/jobs?filter=all&per_page=100`,
      env.GITHUB_TOKEN,
      fetcher
    );
    assert.ok(
      Array.isArray(jobs.jobs) &&
        jobs.total_count < 100 &&
        jobs.total_count === jobs.jobs.length,
      'Unknown earlier upload status; never replay'
    );
    const publishers = jobs.jobs
      .filter((job) => job.name === `publish-${app}` || job.name === 'publish')
      .sort((a, b) => b.run_attempt - a.run_attempt);
    for (const job of publishers) {
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
      const step = job.steps?.find((entry) => entry.name === uploadStepName);
      assert.ok(step, 'Unknown earlier upload step; never replay');
      const notStarted =
        step.conclusion === 'skipped' ||
        (['queued', 'pending'].includes(step.status) && !step.started_at);
      if (notStarted) continue;
      const artifacts = await boundedJson(
        `${base}/runs/${run.id}/artifacts?per_page=100`,
        env.GITHUB_TOKEN,
        fetcher
      );
      assert.ok(
        Array.isArray(artifacts.artifacts) &&
          artifacts.total_count < 100 &&
          artifacts.total_count === artifacts.artifacts.length,
        'Incomplete publication receipt inventory'
      );
      const name = `wave1-${app}-production-publication-${run.head_sha}-${run.id}-${job.run_attempt}`;
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
      // This accepted baseline already cleared all older app history before its upload.
      return;
    }
  }
}

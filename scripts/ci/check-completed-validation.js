#!/usr/bin/env node
const { appendFileSync } = require('node:fs');

const VALIDATION_JOBS = {
  'biome-check.yaml': ['Biome Format Check', 'Biome Lint Check'],
  'codecov.yaml': [
    ...Array.from({ length: 4 }, (_, index) => `Coverage shard (${index})`),
    'Run tests and collect coverage',
  ],
  'turbo-unit-tests.yaml': [
    ...Array.from({ length: 4 }, (_, index) => `Unit test shard (${index})`),
    'Unit Tests (24)',
  ],
};

function isCompletedValidation(run, { repository, sha }) {
  return (
    run?.repository?.full_name === repository &&
    run.head_sha === sha &&
    run.event === 'push' &&
    ['main', 'production'].includes(run.head_branch) &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    Number.isSafeInteger(run.id) &&
    run.id > 0
  );
}

function hasSuccessfulJobs(jobs, requiredJobs) {
  return requiredJobs.every((name) => {
    const matches = jobs.filter((job) => job.name === name);
    return (
      matches.length === 1 &&
      matches[0].status === 'completed' &&
      matches[0].conclusion === 'success'
    );
  });
}

/** Only a generated duplicate may reuse real, completed canonical validation. */
async function completedValidationProof({
  repository,
  sha,
  ref,
  event,
  workflow,
  readApi,
}) {
  const requiredJobs = VALIDATION_JOBS[workflow];
  if (
    event !== 'push' ||
    !ref?.startsWith('refs/heads/release-please--branches--') ||
    !requiredJobs ||
    !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository ?? '') ||
    !/^[a-f0-9]{40}$/.test(sha ?? '')
  )
    return null;

  const prefix = `/repos/${repository}/actions`;
  // Bounded query: omitted/overflow results simply cannot prove a duplicate.
  const result = await readApi(
    `${prefix}/workflows/${workflow}/runs?head_sha=${sha}&event=push&per_page=100`
  );
  if (
    !Array.isArray(result?.workflow_runs) ||
    result.total_count !== result.workflow_runs.length
  )
    return null;
  const latestByBranch = new Map();
  for (const candidate of result.workflow_runs) {
    if (
      candidate?.repository?.full_name !== repository ||
      candidate.head_sha !== sha ||
      candidate.event !== 'push' ||
      !['main', 'production'].includes(candidate.head_branch)
    )
      continue;
    if (!Number.isSafeInteger(candidate.id) || candidate.id < 1) return null;
    const previous = latestByBranch.get(candidate.head_branch);
    if (!previous || candidate.id > previous.id)
      latestByBranch.set(candidate.head_branch, candidate);
  }
  const candidates = [...latestByBranch.values()];
  // A newer pending/failed canonical run vetoes older successful receipts.
  if (
    candidates.some((run) => !isCompletedValidation(run, { repository, sha }))
  )
    return null;
  for (const run of candidates) {
    // Use the current attempt so an earlier success cannot hide a failed rerun.
    if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1)
      return null;
    const jobsResult = await readApi(
      `${prefix}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
    );
    if (
      !Array.isArray(jobsResult?.jobs) ||
      jobsResult.total_count !== jobsResult.jobs.length
    )
      return null;
    if (!hasSuccessfulJobs(jobsResult.jobs, requiredJobs)) return null;
    // Recheck after the job lookup: a just-started rerun invalidates the proof.
    const current = await readApi(`${prefix}/runs/${run.id}`);
    if (
      !isCompletedValidation(current, { repository, sha }) ||
      current.run_attempt !== run.run_attempt
    )
      return null;
  }
  return candidates[0]?.id ?? null;
}

async function main(
  env = process.env,
  { fetchApi = fetch, proofTimeoutMs = 45000 } = {}
) {
  // Shared deadline bounds all candidate/attempt reads, not just one request.
  const proofDeadline = AbortSignal.timeout(proofTimeoutMs);
  let sourceRun = null;
  try {
    sourceRun = await completedValidationProof({
      repository: env.GITHUB_REPOSITORY,
      sha: env.GITHUB_SHA,
      ref: env.GITHUB_REF,
      event: env.GITHUB_EVENT_NAME,
      workflow: env.WORKFLOW_NAME,
      readApi: async (path) => {
        const response = await fetchApi(`https://api.github.com${path}`, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${env.GITHUB_TOKEN ?? ''}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.any([proofDeadline, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error('Validation proof unavailable');
        return await response.json();
      },
    });
  } catch (_) {
    console.warn('Completed validation proof unavailable; running checks.');
  }
  const runChecks = sourceRun === null;
  console.log(
    runChecks
      ? 'Run current validation.'
      : `Reuse successful exact-commit validation from run ${sourceRun}; skip duplicate jobs.`
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `run_checks=${runChecks}\nsource_run_id=${sourceRun ?? ''}\n`
    );
  return { runChecks, sourceRun };
}

module.exports = { completedValidationProof, hasSuccessfulJobs, main };
if (require.main === module)
  main().catch(() => {
    process.exitCode = 1;
  });

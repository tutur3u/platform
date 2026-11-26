import assert from 'node:assert/strict';
import { boundedJson } from './wave1-native-publish.mjs';

// GitHub answers a run's `jobs?filter=all&per_page=100` listing with a 502
// once reruns make it large (about 10 s server time). Jobs are therefore read
// one attempt at a time in small pages. A read that still fails after the
// bounded retries throws: an unread history cannot prove that nothing was
// uploaded, so the publisher stops.
export const jobPageSize = 30;
// Per attempt: 20 pages of 30 jobs.
export const maxAttemptJobPages = 20;
export const maxRunAttempts = 15;
export const attemptConcurrency = 4;
export const readTries = 3;
export const retryBackoffMs = Object.freeze([1_000, 3_000]);
// One cap for every GitHub read of one history walk.
export const historyReadCapMs = 100_000;

const incompleteJobs = 'Unknown earlier upload status; never replay';

function transient(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
    return true;
  // `fetch` reports a dropped connection as a TypeError.
  if (error instanceof TypeError && error.message === 'fetch failed')
    return true;
  return /^Required control-plane observation failed \(5\d\d\)/u.test(
    error?.message ?? ''
  );
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * A GitHub GET that retries only 5xx answers, timeouts and dropped
 * connections, and never past the walk's cap.
 */
export function historyReader({
  env,
  fetcher,
  sleep = pause,
  capMs = historyReadCapMs,
}) {
  const cap = AbortSignal.timeout(capMs);
  return async function read(url) {
    for (let attempt = 1; ; attempt += 1) {
      cap.throwIfAborted();
      try {
        return await boundedJson(
          url,
          env.GITHUB_TOKEN,
          fetcher,
          undefined,
          cap
        );
      } catch (error) {
        if (attempt >= readTries || cap.aborted || !transient(error))
          throw error;
        await sleep(retryBackoffMs[attempt - 1] ?? retryBackoffMs.at(-1));
      }
    }
  };
}

async function attemptJobs({ base, run, attempt, read }) {
  const jobs = [];
  for (let page = 1; page <= maxAttemptJobPages; page += 1) {
    const response = await read(
      `${base}/runs/${run.id}/attempts/${attempt}/jobs?per_page=${jobPageSize}&page=${page}`
    );
    assert.ok(
      Array.isArray(response.jobs) &&
        Number.isSafeInteger(response.total_count) &&
        response.total_count <= maxAttemptJobPages * jobPageSize,
      incompleteJobs
    );
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count || !response.jobs.length) {
      assert.equal(jobs.length, response.total_count, incompleteJobs);
      return jobs;
    }
  }
  assert.fail(incompleteJobs);
}

/** Every job of every attempt of one run, newest attempt first. */
export async function runJobs({ base, run, read }) {
  assert.ok(
    Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0 &&
      run.run_attempt <= maxRunAttempts,
    incompleteJobs
  );
  const attempts = Array.from(
    { length: run.run_attempt },
    (_, index) => run.run_attempt - index
  );
  const jobs = [];
  for (let start = 0; start < attempts.length; start += attemptConcurrency) {
    const batch = await Promise.all(
      attempts
        .slice(start, start + attemptConcurrency)
        .map((attempt) => attemptJobs({ base, run, attempt, read }))
    );
    jobs.push(...batch.flat());
  }
  return jobs;
}

// Every one of these must be present and identical before two listed jobs can
// be one execution. GitHub gives each copy its own id, check run and creation
// time, so those cannot identify it.
const executionFields = [
  'run_id',
  'head_sha',
  'name',
  'runner_id',
  'runner_name',
  'started_at',
  'completed_at',
  'status',
  'conclusion',
];

function executionKey(job) {
  if (executionFields.some((field) => !job[field])) return undefined;
  if (!Array.isArray(job.steps) || !job.steps.length) return undefined;
  const steps = job.steps.map((step) =>
    Object.keys(step)
      .sort()
      .map((field) => [field, step[field]])
  );
  return JSON.stringify([
    executionFields.map((field) => job[field]),
    job.labels ?? null,
    steps,
  ]);
}

// A job that ran has a record older than its end. GitHub creates the record
// of a carried-over copy only when the later attempt starts, after the job it
// copies has already ended.
function recordedAfterItEnded(job) {
  return Date.parse(job.created_at) > Date.parse(job.completed_at);
}

/**
 * A rerun lists every job it did not run again as a copy under the new
 * attempt number. Only the attempt that ran the job wrote its receipt, so a
 * copy is dropped when its record was made after the job ended and an earlier
 * attempt lists the identical execution with a record made while it ran.
 * Anything else stays a separate execution that needs its own receipt, so a
 * copy can never stand in for a later upload. Newest attempt first.
 */
export function originalExecutions(jobs) {
  const ran = new Map();
  for (const job of jobs) {
    const key = executionKey(job);
    if (key === undefined) continue;
    if (Date.parse(job.created_at) <= Date.parse(job.completed_at))
      ran.set(key, Math.min(job.run_attempt, ran.get(key) ?? job.run_attempt));
  }
  return jobs
    .filter((job) => {
      const key = executionKey(job);
      return !(
        key !== undefined &&
        recordedAfterItEnded(job) &&
        ran.get(key) < job.run_attempt
      );
    })
    .sort((a, b) => b.run_attempt - a.run_attempt);
}

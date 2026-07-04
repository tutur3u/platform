#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_QUIET_MINUTES = 30;
const DEFAULT_TIMEOUT_SECONDS = 30;
const SUCCESSFUL_CONCLUSIONS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    once: false,
    pr: '',
    quietMinutes: DEFAULT_QUIET_MINUTES,
    repo: '',
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--once') {
      options.once = true;
      continue;
    }

    const value = argv[index + 1];
    if (arg === '--repo') {
      options.repo = requireValue(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--pr') {
      options.pr = requireValue(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--quiet-minutes') {
      options.quietMinutes = parsePositiveNumber(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--interval-seconds') {
      options.intervalSeconds = parsePositiveNumber(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--timeout-seconds') {
      options.timeoutSeconds = parsePositiveNumber(arg, value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.repo) {
    throw new Error('Missing --repo owner/name.');
  }
  if (!options.pr) {
    throw new Error('Missing --pr number.');
  }

  return options;
}

export function parsePositiveNumber(name, value) {
  const rawValue = requireValue(name, value);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

export function requireValue(name, value) {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

export function splitRepo(repo) {
  const [owner, name, extra] = repo.split('/');
  if (!owner || !name || extra) {
    throw new Error(`Invalid repo "${repo}". Expected owner/name.`);
  }
  return { name, owner };
}

export function createRunner(timeoutSeconds) {
  return (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutSeconds * 1000,
    });
}

export function runJson(run, command, args) {
  return JSON.parse(run(command, args));
}

export function getPr(run, { pr, repo }) {
  return runJson(run, 'gh', [
    'pr',
    'view',
    pr,
    '--repo',
    repo,
    '--json',
    'comments,headRefOid,mergeable,reviewDecision,reviews,state,statusCheckRollup,updatedAt',
  ]);
}

export function getThreadCounts(run, { pr, repo }) {
  const scriptPath = fileURLToPath(
    new URL(
      '../../tuturuuu-review-comments/scripts/fetch_review_threads.py',
      import.meta.url
    )
  );
  const output = run('python3', [
    scriptPath,
    '--repo',
    repo,
    '--pr',
    pr,
    '--active-only',
    '--summary',
  ]);
  const summary = JSON.parse(output);
  return summary.counts;
}

export function getRateLimit(run) {
  const payload = runJson(run, 'gh', ['api', 'rate_limit']);
  return {
    core: payload.resources?.core?.remaining ?? payload.rate?.remaining,
    graphql: payload.resources?.graphql?.remaining,
  };
}

export function checkState(check) {
  return `${check.status ?? 'UNKNOWN'}:${check.conclusion ?? ''}`;
}

export function summarizeChecks(checks = []) {
  const groups = new Map();
  for (const check of checks) {
    if (!check.name) continue;
    const state = checkState(check);
    groups.set(state, (groups.get(state) ?? 0) + 1);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}=${count}`)
    .join(', ');
}

export function failedChecks(checks = []) {
  return checks.filter((check) => {
    if (!check.name || check.status !== 'COMPLETED') return false;
    return !SUCCESSFUL_CONCLUSIONS.has(check.conclusion);
  });
}

export function hasPendingChecks(checks = []) {
  return checks.some((check) => check.name && check.status !== 'COMPLETED');
}

export function latestCommentTime(prData) {
  const times = [];
  for (const comment of prData.comments ?? []) {
    if (comment.createdAt) times.push(comment.createdAt);
    if (comment.updatedAt) times.push(comment.updatedAt);
  }
  for (const review of prData.reviews ?? []) {
    if (review.submittedAt) times.push(review.submittedAt);
  }

  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((time) => new Date(time).getTime())));
}

export function evaluatePrState(prData, threadCounts, nowMs, quietMs) {
  const checks = prData.statusCheckRollup ?? [];
  const failures = failedChecks(checks);
  const latestComment = latestCommentTime(prData);
  const quietForMs = latestComment
    ? nowMs - latestComment.getTime()
    : Number.POSITIVE_INFINITY;
  const activeThreads = threadCounts.active_unresolved ?? 0;
  const pendingChecks = hasPendingChecks(checks);
  const summary = [
    `sha=${prData.headRefOid?.slice(0, 12) ?? 'unknown'}`,
    `checks=${summarizeChecks(checks) || 'none'}`,
    `activeThreads=${activeThreads}`,
    `quietMinutes=${Math.floor(quietForMs / 60000)}`,
    `mergeable=${prData.mergeable ?? 'UNKNOWN'}`,
    `reviewDecision=${prData.reviewDecision || 'none'}`,
  ].join(' | ');

  return {
    activeThreads,
    failures,
    pendingChecks,
    quietForMs,
    ready:
      failures.length === 0 &&
      activeThreads === 0 &&
      !pendingChecks &&
      quietForMs >= quietMs,
    summary,
  };
}

export async function watchPrReady(options, { now = () => Date.now() } = {}) {
  const run = createRunner(options.timeoutSeconds);
  const intervalMs = options.intervalSeconds * 1000;
  const quietMs = options.quietMinutes * 60 * 1000;
  let lastSummary = '';

  const rateLimit = getRateLimit(run);
  console.log(
    `${new Date().toISOString()} rateLimit core=${rateLimit.core ?? 'unknown'} graphql=${rateLimit.graphql ?? 'unknown'}`
  );

  for (;;) {
    const prData = getPr(run, options);
    const threadCounts = getThreadCounts(run, options);
    const state = evaluatePrState(prData, threadCounts, now(), quietMs);

    if (state.summary !== lastSummary) {
      console.log(`${new Date().toISOString()} ${state.summary}`);
      lastSummary = state.summary;
    }

    if (state.failures.length > 0) {
      console.log('Failures:');
      for (const check of state.failures) {
        console.log(`- ${check.name} ${check.conclusion} ${check.detailsUrl}`);
      }
      return 2;
    }

    if (state.activeThreads > 0) {
      console.log(`Active unresolved threads: ${state.activeThreads}`);
      return 3;
    }

    if (state.ready) {
      console.log(
        `${new Date().toISOString()} PR is quiet and checks are clean`
      );
      return 0;
    }

    if (options.once) return 1;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  try {
    const options = parseArgs();
    process.exitCode = await watchPrReady(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

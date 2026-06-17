#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 30;
const SUCCESSFUL_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    branch: '',
    commit: '',
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    once: false,
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
    if (arg === '--branch') {
      options.branch = requireValue(arg, value);
      index += 1;
      continue;
    }
    if (arg === '--commit') {
      options.commit = requireValue(arg, value);
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

  if (!options.repo) throw new Error('Missing --repo owner/name.');
  if (!options.branch) throw new Error('Missing --branch name.');
  if (!options.commit) throw new Error('Missing --commit sha.');

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

export function createRunner(timeoutSeconds) {
  return (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutSeconds * 1000,
    });
}

export function getRuns(run, { branch, commit, repo }) {
  return JSON.parse(
    run('gh', [
      'run',
      'list',
      '--repo',
      repo,
      '--branch',
      branch,
      '--commit',
      commit,
      '--limit',
      '100',
      '--json',
      'conclusion,createdAt,databaseId,event,headSha,status,updatedAt,url,workflowName',
    ])
  );
}

export function runState(run) {
  return `${run.status}:${run.conclusion ?? ''}`;
}

export function summarizeRuns(runs = []) {
  const groups = new Map();
  for (const run of runs) {
    const state = runState(run);
    groups.set(state, (groups.get(state) ?? 0) + 1);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}=${count}`)
    .join(', ');
}

export function failedRuns(runs = []) {
  return runs.filter((run) => {
    if (run.status !== 'completed') return false;
    return !SUCCESSFUL_CONCLUSIONS.has(run.conclusion);
  });
}

export function pendingRuns(runs = []) {
  return runs.filter((run) => run.status !== 'completed');
}

export function evaluateRunState(runs, { branch, commit }) {
  const failures = failedRuns(runs);
  const pending = pendingRuns(runs);
  const summary = [
    `branch=${branch}`,
    `sha=${commit.slice(0, 12)}`,
    `runs=${summarizeRuns(runs) || 'none'}`,
  ].join(' | ');

  return {
    failures,
    pending,
    ready: runs.length > 0 && failures.length === 0 && pending.length === 0,
    summary,
  };
}

export async function watchBranchRuns(options) {
  const run = createRunner(options.timeoutSeconds);
  const intervalMs = options.intervalSeconds * 1000;
  let lastSummary = '';

  for (;;) {
    const runs = getRuns(run, options);
    const state = evaluateRunState(runs, options);

    if (state.summary !== lastSummary) {
      console.log(`${new Date().toISOString()} ${state.summary}`);
      lastSummary = state.summary;
    }

    if (state.failures.length > 0) {
      console.log('Failures:');
      for (const run of state.failures) {
        console.log(`- ${run.workflowName} ${run.conclusion} ${run.url}`);
      }
      return 2;
    }

    if (state.ready) {
      console.log(
        `${new Date().toISOString()} ${options.branch} checks are clean`
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
    process.exitCode = await watchBranchRuns(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

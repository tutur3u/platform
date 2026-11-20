#!/usr/bin/env node
'use strict';

// Daily CI sample for the CI-optimization routine. Reads main-branch Actions
// runs for a UTC window through `gh api`, then prints (or appends) a short
// dated entry for plugins/tuturuuu/skills/tuturuuu-development-tooling/
// references/ci-learnings.md: run counts and cancellations, the slowest
// workflows by wall time, the slowest jobs by queue and execution time, and
// failed jobs that passed on a later attempt (flake candidates).
//
//   node scripts/ci/ci-daily-sample.js [--hours 24] [--jobs-sample 120]
//                                      [--append <file>] [--note "<lesson>"]
//                                      [--savings] [--commits 40]

const { execFileSync } = require('node:child_process');
const { appendFileSync, readFileSync } = require('node:fs');
const path = require('node:path');

const REPO = 'tutur3u/platform';

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, rank)];
}

const seconds = (from, to) =>
  from && to ? (Date.parse(to) - Date.parse(from)) / 1000 : null;

function fmt(value) {
  if (value === null || value === undefined) return 'n/a';
  return value >= 120
    ? `${(value / 60).toFixed(1)} min`
    : `${Math.round(value)} s`;
}

function summarizeRuns(runs) {
  const byConclusion = {};
  const wall = new Map();
  for (const run of runs) {
    const key = run.conclusion || run.status;
    byConclusion[key] = (byConclusion[key] ?? 0) + 1;
    if (run.conclusion !== 'success' && run.conclusion !== 'failure') continue;
    const elapsed = seconds(run.run_started_at, run.updated_at);
    if (elapsed === null) continue;
    if (!wall.has(run.name)) wall.set(run.name, []);
    wall.get(run.name).push(elapsed);
  }
  const slowest = [...wall]
    .map(([name, values]) => ({
      name,
      n: values.length,
      p50: percentile(values, 50),
      p90: percentile(values, 90),
    }))
    .sort((a, b) => b.p50 - a.p50)
    .slice(0, 6);
  return { total: runs.length, byConclusion, slowest };
}

function summarizeJobs(jobs) {
  const stats = new Map();
  const attempts = new Map();
  for (const job of jobs) {
    if (job.conclusion === 'skipped') continue;
    const key = `${job.workflow_name} / ${job.name}`;
    if (!stats.has(key)) stats.set(key, { queue: [], run: [] });
    const queue = seconds(job.created_at, job.started_at);
    const run = seconds(job.started_at, job.completed_at);
    if (queue !== null && queue >= 0) stats.get(key).queue.push(queue);
    if (run !== null && run >= 0 && job.conclusion === 'success')
      stats.get(key).run.push(run);
    const identity = `${job.run_id}|${job.name}`;
    if (!attempts.has(identity)) attempts.set(identity, []);
    attempts.get(identity).push(job);
  }
  const rows = [...stats].map(([name, { queue, run }]) => ({
    name,
    queueP50: percentile(queue, 50),
    queueP90: percentile(queue, 90),
    runP50: percentile(run, 50),
    runP90: percentile(run, 90),
    n: run.length,
  }));
  const recovered = [...attempts.values()]
    .filter(
      (list) =>
        list.some((job) => job.conclusion === 'failure') &&
        list.some((job) => job.conclusion === 'success')
    )
    .map((list) => {
      const failed = list.find((job) => job.conclusion === 'failure');
      return {
        name: `${failed.workflow_name} / ${failed.name}`,
        url: failed.html_url,
      };
    });
  return {
    slowRun: rows
      .filter((row) => row.n)
      .sort((a, b) => b.runP50 - a.runP50)
      .slice(0, 6),
    slowQueue: rows
      .filter((row) => row.queueP90 !== null)
      .sort((a, b) => b.queueP90 - a.queueP90)
      .slice(0, 4),
    recovered,
  };
}

function renderEntry({ date, window, runs, jobs, sampled, note }) {
  const counts = Object.entries(runs.byConclusion)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n} ${key}`)
    .join(', ');
  const lines = [
    `## ${date} | Daily CI sample`,
    '',
    `Window ${window.from} to ${window.to} UTC, main branch: ${runs.total} workflow runs (${counts}). Job timing covers ${sampled} sampled runs; execution uses successful jobs only.`,
    '',
    '| Slowest workflows (wall) | p50 / p90 (n) |',
    '| --- | ---: |',
    ...runs.slowest.map(
      (row) => `| ${row.name} | ${fmt(row.p50)} / ${fmt(row.p90)} (${row.n}) |`
    ),
    '',
    '| Slowest jobs (execution) | p50 / p90 (n) | queue p90 |',
    '| --- | ---: | ---: |',
    ...jobs.slowRun.map(
      (row) =>
        `| ${row.name} | ${fmt(row.runP50)} / ${fmt(row.runP90)} (${row.n}) | ${fmt(row.queueP90)} |`
    ),
    '',
    `Longest queues (p90): ${jobs.slowQueue.map((row) => `${row.name} ${fmt(row.queueP90)}`).join('; ') || 'none'}.`,
    `Failed then passed on a later attempt: ${
      jobs.recovered.length
        ? jobs.recovered.map((item) => `[${item.name}](${item.url})`).join('; ')
        : 'none'
    }. Treat these as flake candidates until the failed assertion is confirmed.`,
  ];
  if (note) lines.push('', note.trim());
  return `\n${lines.join('\n')}\n`;
}

// Read-only API calls retry a bounded number of times: one transient 5xx or
// rate-limit reply must not drop the whole day's entry.
function gh(path, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(
        execFileSync('gh', ['api', '--paginate', '--slurp', path], {
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    } catch (error) {
      if (attempt >= attempts) throw error;
      execFileSync('sleep', [String(attempt * 5)]);
    }
  }
}

// Labeled execution estimates. Cloudflare Source jobs run about 2–7 minutes;
// the ~40 minute workflow wall is queue time and is not counted here.
const SAVINGS_MINUTES = {
  cloudflareJob: 4,
  typecheck: 8,
  testSuite: 6,
  lint: 2,
  docs: 4,
  buildApp: 4,
};

function estimateSavings(plans, rates = SAVINGS_MINUTES, options = {}) {
  const includeBuilds = options.includeBuilds !== false;
  let jobs = 0;
  let minutes = 0;
  let uncertain = 0;
  for (const plan of plans) {
    if (!plan || plan.uncertain) {
      uncertain += 1;
      continue;
    }
    const skippedDeploys = plan.cloudflare?.skip?.length ?? 0;
    jobs += skippedDeploys;
    minutes += skippedDeploys * rates.cloudflareJob;
    if (plan.test?.run === false) {
      jobs += 1;
      minutes += rates.testSuite;
    }
    if (plan.typecheck?.run === false) {
      jobs += 1;
      minutes += rates.typecheck;
    }
    if (plan.lint?.run === false) {
      jobs += 1;
      minutes += rates.lint;
    }
    if (plan.docs?.run === false) {
      jobs += 1;
      minutes += rates.docs;
    }
    const built = plan.build?.apps?.length ?? 0;
    if (includeBuilds && built < 6) {
      const skippedBuilds = 6 - built;
      jobs += skippedBuilds;
      minutes += skippedBuilds * rates.buildApp;
    }
  }
  return {
    commits: plans.length,
    uncertain,
    jobs,
    minutes: Math.round(minutes),
  };
}

function renderSavings(report) {
  const label = report.label ? `${report.label}: ` : '';
  return [
    `${label}Planner savings estimate over ${report.commits} commits (${report.uncertain} uncertain, so those run everything).`,
    `Skipped jobs: ${report.jobs}. Estimated execution minutes: ${report.minutes}.`,
    'Rates are labeled execution estimates, not queue wall: Cloudflare job 4 min, type-check 8, full test suite 6, lint 2, docs 4, each programming app build 4.',
    '',
  ].join('\n');
}

function graphWithNames(loadGraph, cwd) {
  const loaded = loadGraph(cwd);
  const names = {};
  for (const dir of loaded.dirs) {
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(cwd, dir, 'package.json'), 'utf8')
      );
      if (pkg.name) names[dir] = pkg.name;
    } catch {
      /* package-less workspaces have no turbo name */
    }
  }
  return { ...loaded, names };
}

async function plansForCommits(limit) {
  const cwd = path.resolve(__dirname, '../..');
  const { buildPlan, loadOwnership, matchWorkflowPath, SHARED_PATH_FILTERS } =
    await import('./ci-plan.mjs');
  const { loadExtraEdges, loadGraph } = await import('./affected-apps.mjs');
  const graph = graphWithNames(loadGraph, cwd);
  const extraEdges = loadExtraEdges();
  const ownership = loadOwnership(cwd);
  const shas = execFileSync(
    'git',
    ['-C', cwd, 'log', '-n', String(limit), '--format=%H'],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const shared = [...SHARED_PATH_FILTERS];
  const startedBy = (files) => {
    const global = files.some((file) =>
      shared.some((pattern) => matchWorkflowPath(file, pattern))
    );
    if (global) return new Set(Object.keys(ownership));
    const started = new Set();
    for (const [app, patterns] of Object.entries(ownership)) {
      if (
        files.some((file) =>
          patterns.some((pattern) => matchWorkflowPath(file, pattern))
        )
      )
        started.add(app);
    }
    return started;
  };
  return shas.map((sha) => {
    try {
      const files = execFileSync(
        'git',
        [
          '-C',
          cwd,
          'diff',
          '--name-only',
          '--no-renames',
          '-z',
          `${sha}^`,
          sha,
        ],
        { encoding: 'utf8' }
      )
        .split('\0')
        .filter(Boolean);
      const plan = buildPlan({ files, graph, extraEdges, ownership });
      if (!plan.uncertain) {
        const started = startedBy(files);
        plan.cloudflare = {
          ...plan.cloudflare,
          skip: plan.cloudflare.skip.filter((item) => started.has(item.id)),
        };
      }
      return plan;
    } catch {
      return { uncertain: true, reason: 'diff unavailable' };
    }
  });
}

function parseArgs(argv) {
  const options = { hours: 24, jobsSample: 120, commits: 40 };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--hours') options.hours = Number(next());
    else if (arg === '--jobs-sample') options.jobsSample = Number(next());
    else if (arg === '--append') options.append = next();
    else if (arg === '--note') options.note = next();
    else if (arg === '--savings') options.savings = true;
    else if (arg === '--commits') options.commits = Number(next());
    else throw new Error(`Unknown option ${arg}`);
  }
  if (!(options.hours > 0 && options.jobsSample > 0 && options.commits > 0))
    throw new Error('--hours, --jobs-sample and --commits must be positive');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.savings) {
    const plans = await plansForCommits(options.commits);
    const attributable = estimateSavings(plans, SAVINGS_MINUTES, {
      includeBuilds: false,
    });
    process.stdout.write(
      `${renderSavings({
        ...attributable,
        label:
          'Versus today (path filters already drop untouched apps; programming builds stay on the existing affected selector)',
      })}\n`
    );
    return;
  }
  const to = new Date();
  const from = new Date(to.getTime() - options.hours * 3600_000);
  const iso = (date) => date.toISOString().slice(0, 16);
  const pages = gh(
    `repos/${REPO}/actions/runs?branch=main&per_page=100&created=${encodeURIComponent(`${from.toISOString()}..${to.toISOString()}`)}`
  );
  const runs = pages.flatMap((page) => page.workflow_runs);
  // Sample finished runs evenly across the window for job timing.
  const finished = runs.filter((run) => run.status === 'completed');
  const step = Math.max(1, Math.floor(finished.length / options.jobsSample));
  const sampled = finished
    .filter((_, index) => index % step === 0)
    .slice(0, options.jobsSample);
  const jobs = sampled.flatMap((run) =>
    gh(
      `repos/${REPO}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
    )
      .flatMap((page) => page.jobs)
      .concat(
        run.run_attempt > 1
          ? gh(
              `repos/${REPO}/actions/runs/${run.id}/attempts/1/jobs?per_page=100`
            ).flatMap((page) => page.jobs)
          : []
      )
      .map((job) => ({ ...job, workflow_name: run.name }))
  );
  const entry = renderEntry({
    date: to.toISOString().slice(0, 10),
    window: { from: iso(from), to: iso(to) },
    runs: summarizeRuns(runs),
    jobs: summarizeJobs(jobs),
    sampled: sampled.length,
    note: options.note,
  });
  if (options.append) appendFileSync(options.append, entry);
  process.stdout.write(entry);
}

if (require.main === module) main();

module.exports = {
  estimateSavings,
  fmt,
  parseArgs,
  percentile,
  renderEntry,
  renderSavings,
  summarizeJobs,
  summarizeRuns,
};

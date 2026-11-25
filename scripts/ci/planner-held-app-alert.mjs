#!/usr/bin/env node
// Fail-loud report for apps the Production Deployment Planner held.
//
// A failed independent-app job (for example Meet's production publication
// check) does not block migrations, so the planner's red conclusion is easy to
// accept round after round without anyone acting on it. After every planner
// run this keeps one open internal alert task per held app (key
// planner-held:<app>), comments each further round on it, and resolves it once
// the app's jobs pass again. It never opens public GitHub issues. It also
// writes an error annotation and a step summary.
//
// Only job names, caller ids and conclusions are reported: never logs, step
// output or environment values.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  classifyPlannerJobs,
  INDEPENDENT_APP,
  PLANNER_JOB_CLASSES,
  plannerCaller,
} from './production-planner-job-classes.mjs';
import {
  attemptUrl,
  reportTaskAlert,
  summarizeTaskAlert,
} from './ttr-task-alert.mjs';

// A blocked planner (a failed control-plane or platform job) gets its own task.
export const BLOCKED_KEY = 'production-planner';
const HELD = new Set(['failure', 'cancelled', 'timed_out']);
const MAX_PAGES = 10;

export function alertKey(app) {
  return `planner-held:${String(app)
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/gu, '-')}`.slice(0, 80);
}

function alertTitle(app) {
  return app === BLOCKED_KEY
    ? 'Production planner is blocked for migrations'
    : `Production planner holds ${app}`;
}

// Group the planner's jobs by independent app: held jobs, and apps whose
// selected jobs all finished without a held conclusion.
export function summarizeHeldApps(jobs, runConclusion) {
  const held = new Map();
  const ran = new Set();
  for (const job of jobs) {
    const caller = plannerCaller(job?.name)?.caller;
    if (!caller || PLANNER_JOB_CLASSES[caller] !== INDEPENDENT_APP) continue;
    if (job.conclusion === 'skipped') continue;
    ran.add(caller);
    if (!HELD.has(job.conclusion)) continue;
    const list = held.get(caller) ?? [];
    list.push({ name: job.name, conclusion: job.conclusion });
    held.set(caller, list);
  }
  const classification = classifyPlannerJobs(jobs, runConclusion);
  const blocking = classification.ok ? null : classification.reason;
  const recovered = [...ran].filter((app) => !held.has(app)).sort();
  if (!blocking) recovered.push(BLOCKED_KEY);
  return {
    held: [...held].map(([app, list]) => ({ app, jobs: list })),
    recovered,
    blocking,
  };
}

export function reportMarkdown(report, run) {
  const lines = [
    `### Production planner held apps at \`${run.sha.slice(0, 10)}\``,
    '',
    `Planner run: ${run.url} (attempt ${run.attempt}, ${run.conclusion}).`,
  ];
  if (report.blocking)
    lines.push(
      '',
      `**The planner is blocked for migrations: \`${report.blocking}\`.**`
    );
  for (const { app, jobs } of report.held)
    for (const job of jobs)
      lines.push(`- ${app}: ${job.name} ${job.conclusion}`);
  if (report.held.length === 0) lines.push('', 'No app was held.');
  const passing = report.recovered.filter((app) => app !== BLOCKED_KEY);
  if (passing.length) lines.push('', `Passing again: ${passing.join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`GitHub API ${method} ${path} failed (${response.status})`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

export async function plannerJobs(repo, runId, attempt, api = github) {
  const jobs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await api(
      `/repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`
    );
    const rows = Array.isArray(data?.jobs) ? data.jobs : [];
    jobs.push(...rows);
    if (rows.length < 100 || jobs.length >= (data?.total_count ?? 0))
      return jobs;
  }
  throw new Error('planner job inventory exceeds the page limit');
}

// One open task per app keeps each owner's thread separate. The server
// answers `none` for a recovered app that had no open task.
export async function syncAlerts(report, run, send = reportTaskAlert) {
  const alerting = report.held.map(({ app }) => app);
  if (report.blocking) alerting.push(BLOCKED_KEY);
  const body = reportMarkdown(report, run);
  const actions = [];
  const sync = async (app, state) => {
    const action = await send({
      key: alertKey(app),
      state,
      title: alertTitle(app),
      body,
      runUrl: attemptUrl(run.url, run.attempt),
    });
    // Recovered apps without a task, or with no sink configured, stay quiet.
    const quiet =
      action === 'none' || (state === 'recovered' && action === 'unconfigured');
    if (!quiet) actions.push(`${action}:${app}`);
  };
  for (const app of alerting) await sync(app, 'failing');
  for (const app of report.recovered) await sync(app, 'recovered');
  return actions;
}

// Workflow commands end at a newline and decode %-escapes.
export function escapeAnnotation(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

// A re-run of an older planner must not reopen or resolve the current alerts.
export async function isCurrentProductionHead(repo, sha, api = github) {
  const ref = await api(`/repos/${repo}/git/ref/heads/production`);
  return ref?.object?.sha === sha;
}

async function main(env = process.env) {
  for (const name of [
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
    'RUN_ID',
    'RUN_ATTEMPT',
    'RUN_CONCLUSION',
    'RUN_SHA',
    'RUN_URL',
  ])
    if (!env[name]) throw new Error(`${name} is required`);
  const run = {
    sha: env.RUN_SHA,
    url: env.RUN_URL,
    attempt: env.RUN_ATTEMPT,
    conclusion: env.RUN_CONCLUSION,
  };
  if (!(await isCurrentProductionHead(env.GITHUB_REPOSITORY, run.sha))) {
    console.log(
      `Planner run ${env.RUN_ID} is not for the current production head; alerts unchanged.`
    );
    return;
  }
  const jobs = await plannerJobs(
    env.GITHUB_REPOSITORY,
    env.RUN_ID,
    env.RUN_ATTEMPT
  );
  const report = summarizeHeldApps(jobs, env.RUN_CONCLUSION);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, reportMarkdown(report, run));
  for (const { app, jobs: held } of report.held)
    for (const job of held)
      console.log(
        `::error title=Production planner held ${escapeAnnotation(app)}::${escapeAnnotation(`${job.name} ${job.conclusion}`)}; its owner must fix or explain it before the next round.`
      );
  if (report.blocking)
    console.log(
      `::error title=Production planner blocked::${escapeAnnotation(report.blocking)}`
    );
  const actions = await syncAlerts(report, run, (alert) =>
    reportTaskAlert(alert, env)
  );
  summarizeTaskAlert('planner-held', actions.join(', ') || 'none', env);
  console.log(`Alert task actions: ${actions.join(', ') || 'none'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

#!/usr/bin/env node
// Fail-loud report for apps the Production Deployment Planner held.
//
// A failed independent-app job (for example Meet's production publication
// check) does not block migrations, so the planner's red conclusion is easy to
// accept round after round without anyone acting on it. After every planner
// run this keeps one open issue per held app, labeled ALERT_LABEL for the fleet
// monitors, comments each further round on it, and closes it once the app's
// jobs pass again. It also writes an error annotation and a step summary.
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

export const ALERT_LABEL = 'release-admission-alert';
// A blocked planner (a failed control-plane or platform job) gets its own issue.
export const BLOCKED_KEY = 'production-planner';
const HELD = new Set(['failure', 'cancelled', 'timed_out']);
const MAX_PAGES = 10;

function marker(app) {
  return `<!-- planner-held-app:${app} -->`;
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
  // Creating a label that already exists returns 422, which is fine.
  const existingLabel =
    response.status === 422 && method === 'POST' && path.endsWith('/labels');
  if (!response.ok && !existingLabel)
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

// One open issue per app keeps each owner's thread separate.
export async function syncAlerts(report, run, repo, api = github) {
  const open =
    (await api(
      `/repos/${repo}/issues?labels=${ALERT_LABEL}&state=open&per_page=100`
    )) ?? [];
  // Only issues this workflow opened: never a pull request or another account's.
  const issueFor = (app) =>
    open.find(
      (issue) =>
        !issue?.pull_request &&
        issue?.user?.login === 'github-actions[bot]' &&
        issue?.body?.includes(marker(app))
    ) ?? null;
  const alerting = report.held.map(({ app }) => app);
  if (report.blocking) alerting.push(BLOCKED_KEY);
  const body = reportMarkdown(report, run);
  const actions = [];
  if (alerting.length)
    await api(`/repos/${repo}/labels`, {
      method: 'POST',
      body: { name: ALERT_LABEL, color: 'b60205' },
    });
  for (const app of alerting) {
    const issue = issueFor(app);
    if (issue) {
      await api(`/repos/${repo}/issues/${issue.number}/comments`, {
        method: 'POST',
        body: { body },
      });
      actions.push(`comment:${app}`);
    } else {
      await api(`/repos/${repo}/issues`, {
        method: 'POST',
        body: {
          title:
            app === BLOCKED_KEY
              ? 'Production planner is blocked for migrations'
              : `Production planner holds ${app}`,
          labels: [ALERT_LABEL],
          body: `${marker(app)}\n${body}`,
        },
      });
      actions.push(`open:${app}`);
    }
  }
  for (const app of report.recovered) {
    const issue = issueFor(app);
    if (!issue) continue;
    await api(`/repos/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: { body },
    });
    await api(`/repos/${repo}/issues/${issue.number}`, {
      method: 'PATCH',
      body: { state: 'closed', state_reason: 'completed' },
    });
    actions.push(`close:${app}`);
  }
  return actions;
}

// Workflow commands end at a newline and decode %-escapes.
export function escapeAnnotation(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

// A re-run of an older planner must not reopen or close the current issues.
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
  const actions = await syncAlerts(report, run, env.GITHUB_REPOSITORY);
  console.log(`Alert actions: ${actions.join(', ') || 'none'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

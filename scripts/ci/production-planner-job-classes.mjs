// Positive classification of every job in a Production Deployment Planner run.
//
// The production migration consumer accepts a planner run that concluded
// `success` or `failure`. A failed run is admitted only when every failed job
// belongs to a named independent app. Each caller job of vercel-production.yaml
// appears here exactly once; a caller that is not listed, or a job whose name
// does not parse, fails closed. Changing this table needs security review, and
// production-migration-target.test.js keeps it identical to the caller jobs.

export const CONTROL_PLANE_REQUIRED = 'control-plane-required';
export const PLATFORM_REQUIRED = 'platform-required';
export const INDEPENDENT_APP = 'independent-app';

const controlPlane = [
  'plan',
  'deploy-colab-cloudflare',
  'deploy-coordination-cloudflare',
  'deploy-cron-control-cloudflare',
  'deploy-devbox-control-cloudflare',
];
const independentApps = [
  // The deployment coordinator falls open in CI, so its publication never
  // gates platform deploys or migrations.
  'deploy-deploy-coordinator-cloudflare',
  'deploy-lettin-cloudflare',
  'deploy-calendar-native',
  'deploy-mail-native',
  'deploy-apps-native',
  // Not a database-migration gate. Recovery ignores this caller because Meet
  // ships from its own pinned dispatch. This class stays so a failed planner
  // is still explained, and Meet's own admission stays strict.
  'deploy-meet-cloudflare',
  'deploy-parley-cloudflare',
  'deploy-mastermind-cloudflare',
  'deploy-tasks',
];

export const PLANNER_JOB_CLASSES = Object.freeze(
  Object.fromEntries([
    ...controlPlane.map((id) => [id, CONTROL_PLANE_REQUIRED]),
    ['deploy-web-cloudflare', PLATFORM_REQUIRED],
    ...independentApps.map((id) => [id, INDEPENDENT_APP]),
  ])
);

export const REQUIRED_PLANNER_JOBS = Object.freeze([
  'plan',
  'deploy-web-cloudflare / Verify-Production',
]);

const heldConclusions = new Set(['failure', 'cancelled', 'timed_out']);
const clearConclusions = new Set(['success', 'skipped', 'neutral']);
const jobName = /^(plan|deploy-[a-z0-9-]+)(?: \/ (\S.*))?$/;

function reject(reason) {
  return { ok: false, reason, held: [] };
}

// A skipped caller appears as its bare name and a selected caller appears only
// as `<caller> / <nested job>`, so the caller id is the part before ` / `.
export function plannerCaller(name) {
  const match = typeof name === 'string' ? jobName.exec(name) : null;
  return match ? { caller: match[1], nested: match[2] ?? null } : null;
}

export function classifyPlannerJobs(jobs, runConclusion) {
  if (runConclusion !== 'success' && runConclusion !== 'failure')
    return reject('planner-conclusion-not-terminal');
  if (!Array.isArray(jobs) || jobs.length === 0)
    return reject('planner-jobs-missing');
  const byName = new Map();
  const heldByApp = new Map();
  for (const job of jobs) {
    if (job === null || typeof job !== 'object' || byName.has(job.name))
      return reject('planner-job-identity');
    byName.set(job.name, job);
    const parsed = plannerCaller(job.name);
    const kind = parsed ? PLANNER_JOB_CLASSES[parsed.caller] : undefined;
    if (!kind) return reject('planner-job-unclassified');
    if (job.status !== 'completed') return reject('planner-job-not-terminal');
    const conclusion = job.conclusion;
    if (clearConclusions.has(conclusion)) {
      // Skipped means the caller was not selected or a later stage did not run.
      const accepted =
        kind === INDEPENDENT_APP ||
        conclusion === 'success' ||
        (kind === CONTROL_PLANE_REQUIRED && conclusion === 'skipped');
      if (!accepted) return reject('required-job-not-successful');
      continue;
    }
    if (!heldConclusions.has(conclusion))
      return reject('planner-job-conclusion-unknown');
    if (kind !== INDEPENDENT_APP) return reject('required-job-failed');
    const list = heldByApp.get(parsed.caller) ?? [];
    list.push({ name: job.name, conclusion });
    heldByApp.set(parsed.caller, list);
  }
  for (const required of REQUIRED_PLANNER_JOBS)
    if (byName.get(required)?.conclusion !== 'success')
      return reject('required-job-missing-or-unsuccessful');
  const held = [...heldByApp].map(([app, held_jobs]) => ({
    app,
    jobs: held_jobs,
  }));
  if (runConclusion === 'success' && held.length > 0)
    return reject('planner-conclusion-inconsistent');
  if (runConclusion === 'failure' && held.length === 0)
    return reject('planner-failure-unexplained');
  return { ok: true, reason: 'only-independent-apps-held', held };
}

// Held app names, job names and conclusions only: never logs or environment.
export function heldAppSummary(held) {
  const lines = ['### Held apps (migration proceeds)'];
  for (const { app, jobs } of held)
    for (const job of jobs)
      lines.push(`- ${app}: ${job.name} ${job.conclusion}`);
  return lines.join('\n');
}

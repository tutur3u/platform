import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  INDEPENDENT_APP,
  PLANNER_JOB_CLASSES,
  plannerCaller,
} from './production-planner-job-classes.mjs';

const verificationFailures = new Map([
  ['deploy-lettin-cloudflare / deploy', 'Verify deployed storage and version'],
  ['deploy-parley-cloudflare / deploy', 'Verify rendered canonical route'],
]);
// Meet ships from its own pinned dispatch. No job of this planner caller
// gates a production database migration. Meet's own admission is unchanged.
const MEET_MIGRATION_IGNORED_CALLER = 'deploy-meet-cloudflare';
export const VERCEL_HOBBY_DEPLOY_QUOTA_CODE = 'api-deployments-free-per-day';
const VERCEL_DEPLOY_STEP = 'Deploy Project Artifacts to Vercel';
const PLATFORM_MARKER_STEP = 'Record successful Vercel deployment marker';
const quotaCodePattern =
  /(?<![A-Za-z0-9-])api-deployments-free-per-day(?![A-Za-z0-9-])/;

export function vercelHobbyDeployQuotaCode(logText: string): string | null {
  return quotaCodePattern.test(logText) ? VERCEL_HOBBY_DEPLOY_QUOTA_CODE : null;
}
const acceptable = new Set(['success', 'skipped', 'neutral']);
const fullSha = /^[0-9a-f]{40}$/;
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function result(allowed: boolean, reason: string) {
  return { allowed, reason };
}

function isIgnoredMeetPlannerJob(job: RecordValue) {
  return plannerCaller(job.name)?.caller === MEET_MIGRATION_IGNORED_CALLER;
}

function isVercelHobbyQuotaFailure(
  job: RecordValue,
  failures: readonly RecordValue[]
) {
  const parsed = plannerCaller(job.name);
  return (
    parsed?.nested === 'Deploy-Production' &&
    PLANNER_JOB_CLASSES[parsed.caller] === INDEPENDENT_APP &&
    failures.length === 1 &&
    failures[0]?.name === VERCEL_DEPLOY_STEP &&
    job.vercelQuotaCode === VERCEL_HOBBY_DEPLOY_QUOTA_CODE
  );
}

function applyQuotaLogs(jobPages: unknown, logDir: string | undefined) {
  if (!Array.isArray(jobPages)) return;
  for (const page of jobPages) {
    if (!record(page) || !Array.isArray(page.jobs)) continue;
    for (const job of page.jobs) {
      if (!record(job)) continue;
      delete job.vercelQuotaCode;
      if (!logDir || !Number.isSafeInteger(job.id)) continue;
      let text = '';
      try {
        text = readFileSync(join(logDir, `${job.id}.log`), 'utf8');
      } catch {
        text = '';
      }
      const code = vercelHobbyDeployQuotaCode(text);
      if (code) job.vercelQuotaCode = code;
    }
  }
}

export function checkProductionMigrationRecovery(input: {
  allow: boolean;
  eventName: string;
  refName: string;
  expectedSha: string;
  targetSha: string;
  planner: unknown;
  jobPages: unknown;
}) {
  if (
    !input.allow ||
    input.eventName !== 'workflow_dispatch' ||
    input.refName !== 'production'
  )
    return result(false, 'manual_production_opt_in_required');
  if (!fullSha.test(input.expectedSha) || input.expectedSha !== input.targetSha)
    return result(false, 'expected_target_sha_mismatch');
  const run = input.planner;
  if (
    !record(run) ||
    run.name !== 'Production Deployment Planner' ||
    run.head_sha !== input.targetSha ||
    run.head_branch !== 'production' ||
    run.status !== 'completed' ||
    run.conclusion !== 'failure' ||
    !Number.isSafeInteger(run.id) ||
    !Number.isSafeInteger(run.run_attempt)
  )
    return result(false, 'matching_failed_planner_required');
  if (!Array.isArray(input.jobPages) || input.jobPages.length === 0)
    return result(false, 'complete_job_pages_required');
  const jobs: RecordValue[] = [];
  let total: unknown;
  for (const page of input.jobPages) {
    if (
      !record(page) ||
      !Number.isSafeInteger(page.total_count) ||
      !Array.isArray(page.jobs) ||
      (total !== undefined && total !== page.total_count) ||
      page.jobs.some((job) => !record(job))
    )
      return result(false, 'invalid_job_pages');
    total = page.total_count;
    jobs.push(...(page.jobs as RecordValue[]));
  }
  if (jobs.length !== total || jobs.length === 0)
    return result(false, 'incomplete_job_inventory');
  const names = new Map<string, RecordValue>();
  const ids = new Set<unknown>();
  for (const job of jobs) {
    if (
      typeof job.name !== 'string' ||
      names.has(job.name) ||
      ids.has(job.id) ||
      !Number.isSafeInteger(job.id) ||
      job.run_id !== run.id ||
      job.run_attempt !== run.run_attempt ||
      job.head_sha !== input.targetSha ||
      job.head_branch !== 'production' ||
      job.status !== 'completed' ||
      !Array.isArray(job.steps)
    )
      return result(false, 'job_identity_or_terminal_status_invalid');
    names.set(job.name, job);
    ids.add(job.id);
    if (isIgnoredMeetPlannerJob(job)) continue;
    const failures: RecordValue[] = [];
    for (const step of job.steps) {
      if (
        !record(step) ||
        step.status !== 'completed' ||
        (step.conclusion !== 'failure' &&
          !acceptable.has(String(step.conclusion)))
      )
        return result(false, 'step_not_terminal_acceptable');
      if (step.conclusion === 'failure') failures.push(step);
    }
    if (job.conclusion === 'failure') {
      const canonicalStep = verificationFailures.get(job.name);
      if (
        canonicalStep &&
        failures.length === 1 &&
        failures[0]?.name === canonicalStep
      ) {
        continue;
      }
      if (isVercelHobbyQuotaFailure(job, failures)) continue;
      return result(false, 'failure_outside_canonical_verification');
    } else if (
      !acceptable.has(String(job.conclusion)) ||
      failures.length !== 0
    ) {
      return result(false, 'other_job_not_acceptable');
    }
  }
  const blockingFailures = [...names.values()].filter(
    (job) => job.conclusion === 'failure' && !isIgnoredMeetPlannerJob(job)
  );
  const ignoredMeet = [...names.values()].some(
    (job) =>
      isIgnoredMeetPlannerJob(job) &&
      (job.conclusion === 'failure' ||
        job.conclusion === 'cancelled' ||
        job.conclusion === 'timed_out')
  );
  if (blockingFailures.length === 0 && !ignoredMeet)
    return result(false, 'verification_failure_required');
  const quotaOnly =
    blockingFailures.length > 0 &&
    blockingFailures.every((job) =>
      isVercelHobbyQuotaFailure(
        job,
        (job.steps as RecordValue[]).filter(
          (step) => step.conclusion === 'failure'
        )
      )
    );
  if (blockingFailures.length > 0 && !quotaOnly) {
    for (const name of verificationFailures.keys()) {
      if (
        names.get(name.replace(' / deploy', ' / validate'))?.conclusion !==
        'success'
      )
        return result(false, 'all_cloudflare_validations_required');
    }
  }
  const platform = names.get('deploy-platform / Deploy-Production');
  const marker = (platform?.steps as RecordValue[] | undefined)?.find(
    (step) => step.name === PLATFORM_MARKER_STEP
  );
  if (platform?.conclusion !== 'success' || marker?.conclusion !== 'success')
    return result(false, 'successful_platform_deployment_required');
  return result(
    true,
    blockingFailures.length === 0
      ? 'meet_planner_job_ignored'
      : quotaOnly
        ? 'only_vercel_hobby_deploy_quota_failed'
        : 'only_canonical_cloudflare_verification_failed'
  );
}

function main() {
  const env = process.env;
  const jobPages = JSON.parse(
    readFileSync(env.RECOVERY_JOBS_FILE ?? '', 'utf8')
  );
  applyQuotaLogs(jobPages, env.RECOVERY_JOB_LOG_DIR);
  const decision = checkProductionMigrationRecovery({
    allow: env.ALLOW_CLOUDFLARE_VERIFICATION_FAILURES === 'true',
    eventName: env.EVENT_NAME ?? '',
    refName: env.CURRENT_REF_NAME ?? '',
    expectedSha: env.EXPECTED_SHA ?? '',
    targetSha: env.TARGET_SHA ?? '',
    planner: JSON.parse(readFileSync(env.RECOVERY_PLANNER_FILE ?? '', 'utf8')),
    jobPages,
  });
  console.log(`Migration recovery: ${decision.reason}`);
  if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(env.GITHUB_OUTPUT, `recovery_allowed=${decision.allowed}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();

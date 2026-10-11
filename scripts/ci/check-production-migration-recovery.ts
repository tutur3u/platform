import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const verificationFailures = new Map([
  ['deploy-lettin-cloudflare / deploy', 'Verify deployed storage and version'],
  ['deploy-meet-cloudflare / deploy', 'Verify canonical routes'],
  ['deploy-parley-cloudflare / deploy', 'Verify rendered canonical route'],
]);
const acceptable = new Set(['success', 'skipped', 'neutral']);
const fullSha = /^[0-9a-f]{40}$/;
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function result(allowed: boolean, reason: string) {
  return { allowed, reason };
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
  let failed = 0;
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
      failed++;
      if (
        !verificationFailures.has(job.name) ||
        failures.length !== 1 ||
        failures[0]?.name !== verificationFailures.get(job.name)
      )
        return result(false, 'failure_outside_canonical_verification');
    } else if (
      !acceptable.has(String(job.conclusion)) ||
      failures.length !== 0
    ) {
      return result(false, 'other_job_not_acceptable');
    }
  }
  if (failed === 0) return result(false, 'verification_failure_required');
  for (const name of verificationFailures.keys()) {
    if (
      names.get(name.replace(' / deploy', ' / validate'))?.conclusion !==
      'success'
    )
      return result(false, 'all_cloudflare_validations_required');
  }
  if (
    names.get('deploy-platform / Deploy-Production')?.conclusion !== 'success'
  )
    return result(false, 'successful_platform_deployment_required');
  return result(true, 'only_canonical_cloudflare_verification_failed');
}

function main() {
  const env = process.env;
  const decision = checkProductionMigrationRecovery({
    allow: env.ALLOW_CLOUDFLARE_VERIFICATION_FAILURES === 'true',
    eventName: env.EVENT_NAME ?? '',
    refName: env.CURRENT_REF_NAME ?? '',
    expectedSha: env.EXPECTED_SHA ?? '',
    targetSha: env.TARGET_SHA ?? '',
    planner: JSON.parse(readFileSync(env.RECOVERY_PLANNER_FILE ?? '', 'utf8')),
    jobPages: JSON.parse(readFileSync(env.RECOVERY_JOBS_FILE ?? '', 'utf8')),
  });
  console.log(`Migration recovery: ${decision.reason}`);
  if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(env.GITHUB_OUTPUT, `recovery_allowed=${decision.allowed}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();

const test = require('node:test');
const { readStagingProof } = require('./fixtures/staging-proof-source.cjs');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const helper = import('./check-production-migration-recovery.ts');
const sha = 'a'.repeat(40);
const failureSteps = [
  ['deploy-lettin-cloudflare', 'Verify deployed storage and version'],
  ['deploy-meet-cloudflare', 'Verify canonical routes'],
  ['deploy-parley-cloudflare', 'Verify rendered canonical route'],
];
function fixture() {
  const planner = {
    id: 100,
    run_attempt: 2,
    name: 'Production Deployment Planner',
    head_sha: sha,
    head_branch: 'production',
    status: 'completed',
    conclusion: 'failure',
  };
  const jobs = [];
  function job(name, conclusion, steps = []) {
    jobs.push({
      id: jobs.length + 1,
      run_id: 100,
      run_attempt: 2,
      head_sha: sha,
      head_branch: 'production',
      name,
      status: 'completed',
      conclusion,
      steps,
    });
  }
  const step = (name, conclusion) => ({
    name,
    status: 'completed',
    conclusion,
  });
  for (const [prefix, failed] of failureSteps) {
    job(`${prefix} / validate`, 'success', [step('Build', 'success')]);
    job(`${prefix} / deploy`, 'failure', [
      step('Deploy', 'success'),
      step(failed, 'failure'),
      step('Record marker', 'skipped'),
    ]);
  }
  job('deploy-platform / Deploy-Production', 'success', [
    step('Promote', 'success'),
    step('Record successful Vercel deployment marker', 'success'),
  ]);
  job('plan', 'success', [step('Resolve', 'success')]);
  job('deploy-mail / Deploy-Production', 'skipped');
  return {
    allow: true,
    eventName: 'workflow_dispatch',
    refName: 'production',
    expectedSha: sha,
    targetSha: sha,
    planner,
    jobPages: [{ total_count: jobs.length, jobs }],
  };
}
async function decision(input) {
  return (await helper).checkProductionMigrationRecovery(input);
}
test('explicit exact-SHA manual recovery accepts only canonical verification failures', async () => {
  assert.deepEqual(await decision(fixture()), {
    allowed: true,
    reason: 'only_canonical_cloudflare_verification_failed',
  });
});
const QUOTA = 'api-deployments-free-per-day';
function quotaFixture() {
  const x = fixture();
  x.jobPages[0].jobs = x.jobPages[0].jobs.filter(
    (job) =>
      !String(job.name).startsWith('deploy-lettin') &&
      !String(job.name).startsWith('deploy-meet') &&
      !String(job.name).startsWith('deploy-parley')
  );
  const step = (name, conclusion) => ({
    name,
    status: 'completed',
    conclusion,
  });
  x.jobPages[0].jobs.unshift({
    id: 50,
    run_id: 100,
    run_attempt: 2,
    head_sha: sha,
    head_branch: 'production',
    name: 'deploy-ai / Deploy-Production',
    status: 'completed',
    conclusion: 'failure',
    vercelQuotaCode: QUOTA,
    steps: [
      step('Build Project Artifacts', 'success'),
      step('Deploy Project Artifacts to Vercel', 'failure'),
      step('Record successful Vercel deployment marker', 'skipped'),
    ],
  });
  x.jobPages[0].total_count = x.jobPages[0].jobs.length;
  return x;
}
test('satellite Hobby quota is admitted only for that code and job class', async () => {
  const { CONTROL_PLANE_REQUIRED, INDEPENDENT_APP, PLANNER_JOB_CLASSES } =
    await import('./production-planner-job-classes.mjs');
  assert.equal(PLANNER_JOB_CLASSES['deploy-ai'], INDEPENDENT_APP);
  assert.equal(PLANNER_JOB_CLASSES['deploy-inventory'], INDEPENDENT_APP);
  assert.notEqual(PLANNER_JOB_CLASSES['deploy-platform'], INDEPENDENT_APP);
  assert.equal(
    PLANNER_JOB_CLASSES['deploy-cron-control-cloudflare'],
    CONTROL_PLANE_REQUIRED
  );
  assert.deepEqual(await decision(quotaFixture()), {
    allowed: true,
    reason: 'only_vercel_hobby_deploy_quota_failed',
  });
  const mixed = fixture();
  mixed.jobPages[0].jobs.push({
    ...quotaFixture().jobPages[0].jobs[0],
    id: 60,
  });
  mixed.jobPages[0].total_count = mixed.jobPages[0].jobs.length;
  assert.equal((await decision(mixed)).allowed, true);
  const wrongCode = quotaFixture();
  wrongCode.jobPages[0].jobs[0].vercelQuotaCode = 'deployment_error';
  assert.equal((await decision(wrongCode)).allowed, false);
  const controlPlane = quotaFixture();
  controlPlane.jobPages[0].jobs[0].name =
    'deploy-colab-cloudflare / Deploy-Production';
  assert.equal((await decision(controlPlane)).allowed, false);
  const otherCloudflare = quotaFixture();
  otherCloudflare.jobPages[0].jobs[0].name =
    'deploy-parley-cloudflare / deploy';
  assert.equal((await decision(otherCloudflare)).allowed, false);
  const vercelMeet = quotaFixture();
  vercelMeet.jobPages[0].jobs[0].name = 'deploy-meet / Deploy-Production';
  vercelMeet.jobPages[0].jobs[0].vercelQuotaCode = 'deployment_error';
  assert.equal((await decision(vercelMeet)).allowed, false);
  const otherStep = quotaFixture();
  otherStep.jobPages[0].jobs[0].steps[1].name = 'Build Project Artifacts';
  assert.equal((await decision(otherStep)).allowed, false);
  const secondQuotaStep = quotaFixture();
  secondQuotaStep.jobPages[0].jobs[0].steps.push({
    name: 'Build Project Artifacts',
    status: 'completed',
    conclusion: 'failure',
  });
  assert.deepEqual(await decision(secondQuotaStep), {
    allowed: false,
    reason: 'failure_outside_canonical_verification',
  });
  const cronQuota = quotaFixture();
  cronQuota.jobPages[0].jobs[0].name =
    'deploy-cron-control-cloudflare / Deploy-Production';
  assert.equal((await decision(cronQuota)).allowed, false);
  const missingMarker = quotaFixture();
  const marker = missingMarker.jobPages[0].jobs.find(
    (job) => job.name === 'deploy-platform / Deploy-Production'
  );
  marker.steps.find(
    (step) => step.name === 'Record successful Vercel deployment marker'
  ).conclusion = 'skipped';
  assert.equal((await decision(missingMarker)).allowed, false);
});
test('Meet planner outcome does not gate migration recovery', async () => {
  function meetOnly(name, stepName, conclusion = 'failure') {
    const x = quotaFixture();
    const job = x.jobPages[0].jobs[0];
    job.name = name;
    delete job.vercelQuotaCode;
    job.steps = [{ name: stepName, status: 'completed', conclusion }];
    return x;
  }
  const evaluate = 'Evaluate Meet production publication and exact-source CI';
  const only = meetOnly(`deploy-meet-cloudflare / ${evaluate}`, evaluate);
  assert.deepEqual(await decision(only), {
    allowed: true,
    reason: 'meet_planner_job_ignored',
  });
  const withQuota = quotaFixture();
  withQuota.jobPages[0].jobs.push({
    ...only.jobPages[0].jobs[0],
    id: 61,
  });
  withQuota.jobPages[0].total_count = withQuota.jobPages[0].jobs.length;
  assert.deepEqual(await decision(withQuota), {
    allowed: true,
    reason: 'only_vercel_hobby_deploy_quota_failed',
  });
  const withCron = meetOnly(`deploy-meet-cloudflare / ${evaluate}`, evaluate);
  withCron.jobPages[0].jobs.push({
    ...withCron.jobPages[0].jobs[0],
    id: 62,
    name: 'deploy-cron-control-cloudflare / validate',
    steps: [{ name: 'Validate', status: 'completed', conclusion: 'failure' }],
  });
  withCron.jobPages[0].total_count = withCron.jobPages[0].jobs.length;
  assert.equal((await decision(withCron)).allowed, false);
  const withCalendar = meetOnly(
    `deploy-meet-cloudflare / ${evaluate}`,
    evaluate
  );
  withCalendar.jobPages[0].jobs.push({
    ...withCalendar.jobPages[0].jobs[0],
    id: 63,
    name: 'deploy-calendar-native / native-profiles / build',
    steps: [{ name: 'Build', status: 'completed', conclusion: 'failure' }],
  });
  withCalendar.jobPages[0].total_count = withCalendar.jobPages[0].jobs.length;
  assert.equal((await decision(withCalendar)).allowed, false);
  const cancelled = meetOnly(
    'deploy-meet-cloudflare / deploy',
    'Verify canonical routes',
    'cancelled'
  );
  assert.equal((await decision(cancelled)).reason, 'meet_planner_job_ignored');
  const missingMarker = meetOnly(
    `deploy-meet-cloudflare / ${evaluate}`,
    evaluate
  );
  missingMarker.jobPages[0].jobs
    .find((job) => job.name === 'deploy-platform / Deploy-Production')
    .steps.find(
      (step) => step.name === 'Record successful Vercel deployment marker'
    ).conclusion = 'skipped';
  assert.equal((await decision(missingMarker)).allowed, false);
});
test('quota code is a whole token and the CLI reads it only from the job log', async () => {
  const { vercelHobbyDeployQuotaCode } = await helper;
  assert.equal(vercelHobbyDeployQuotaCode(`Error: ${QUOTA}`), QUOTA);
  assert.equal(vercelHobbyDeployQuotaCode(`prefix-${QUOTA}`), null);
  assert.equal(vercelHobbyDeployQuotaCode(`${QUOTA}-extra`), null);
  const dir = mkdtempSync(join(tmpdir(), 'migration-quota-'));
  try {
    const forged = quotaFixture();
    writeFileSync(join(dir, 'planner'), JSON.stringify(forged.planner));
    writeFileSync(join(dir, 'jobs'), JSON.stringify(forged.jobPages));
    const output = join(dir, 'output');
    const env = {
      ...process.env,
      ALLOW_CLOUDFLARE_VERIFICATION_FAILURES: 'true',
      EVENT_NAME: forged.eventName,
      CURRENT_REF_NAME: forged.refName,
      EXPECTED_SHA: sha,
      TARGET_SHA: sha,
      RECOVERY_PLANNER_FILE: join(dir, 'planner'),
      RECOVERY_JOBS_FILE: join(dir, 'jobs'),
      GITHUB_OUTPUT: output,
    };
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        join(__dirname, 'check-production-migration-recovery.ts'),
      ],
      { env }
    );
    assert.equal(readFileSync(output, 'utf8'), 'recovery_allowed=false\n');
    writeFileSync(output, '');
    writeFileSync(join(dir, '50.log'), `Vercel error ${QUOTA}\n`);
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        join(__dirname, 'check-production-migration-recovery.ts'),
      ],
      { env: { ...env, RECOVERY_JOB_LOG_DIR: dir } }
    );
    assert.equal(readFileSync(output, 'utf8'), 'recovery_allowed=true\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const mutations = {
  'default off': (x) => {
    x.allow = false;
  },
  'automatic workflow run': (x) => {
    x.eventName = 'workflow_run';
  },
  'main dispatch': (x) => {
    x.refName = 'main';
  },
  'missing expected': (x) => {
    x.expectedSha = '';
  },
  'abbreviated expected': (x) => {
    x.expectedSha = 'a'.repeat(7);
  },
  'wrong target': (x) => {
    x.targetSha = 'b'.repeat(40);
  },
  'wrong planner SHA': (x) => {
    x.planner.head_sha = 'b'.repeat(40);
  },
  'wrong planner branch': (x) => {
    x.planner.head_branch = 'main';
  },
  'wrong workflow name': (x) => {
    x.planner.name = 'Other';
  },
  'running planner': (x) => {
    x.planner.status = 'in_progress';
  },
  'cancelled planner': (x) => {
    x.planner.conclusion = 'cancelled';
  },
  'ordinary success is not a recovery certificate': (x) => {
    x.planner.conclusion = 'success';
  },
  'missing jobs': (x) => {
    x.jobPages = [];
  },
  'truncated page': (x) => {
    x.jobPages[0].total_count++;
  },
  'duplicate job': (x) => {
    x.jobPages[0].jobs[1] = { ...x.jobPages[0].jobs[0] };
  },
  'foreign run': (x) => {
    x.jobPages[0].jobs[0].run_id++;
  },
  'foreign attempt': (x) => {
    x.jobPages[0].jobs[0].run_attempt++;
  },
  'foreign job SHA': (x) => {
    x.jobPages[0].jobs[0].head_sha = 'b'.repeat(40);
  },
  'foreign job branch': (x) => {
    x.jobPages[0].jobs[0].head_branch = 'main';
  },
  'queued job': (x) => {
    x.jobPages[0].jobs[0].status = 'queued';
  },
  'cancelled sibling': (x) => {
    x.jobPages[0].jobs[8].conclusion = 'cancelled';
  },
  'timed out sibling': (x) => {
    x.jobPages[0].jobs[8].conclusion = 'timed_out';
  },
  'non-allowlisted failure': (x) => {
    x.jobPages[0].jobs[7].conclusion = 'failure';
  },
  'failed validation': (x) => {
    x.jobPages[0].jobs[0].conclusion = 'failure';
  },
  'skipped validation': (x) => {
    x.jobPages[0].jobs[0].conclusion = 'skipped';
  },
  'missing platform': (x) => {
    x.jobPages[0].jobs[6].name = 'other';
  },
  'skipped platform': (x) => {
    x.jobPages[0].jobs[6].conclusion = 'skipped';
  },
  'earlier deploy failure': (x) => {
    x.jobPages[0].jobs[1].steps[1].name = 'Deploy verified Worker';
  },
  'second failed step': (x) => {
    x.jobPages[0].jobs[1].steps[2].conclusion = 'failure';
  },
  'in-progress step': (x) => {
    x.jobPages[0].jobs[1].steps[2].status = 'in_progress';
  },
  'cancelled step': (x) => {
    x.jobPages[0].jobs[1].steps[2].conclusion = 'cancelled';
  },
  'success job with failed step': (x) => {
    x.jobPages[0].jobs[7].steps[0].conclusion = 'failure';
  },
  'malformed job': (x) => {
    x.jobPages[0].jobs[0] = null;
  },
  'malformed steps': (x) => {
    x.jobPages[0].jobs[0].steps = null;
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`rejects ${name}`, async () => {
    const x = fixture();
    mutate(x);
    assert.equal((await decision(x)).allowed, false);
  });
test('complete multi-page job inventory accepts, inconsistent totals reject', async () => {
  const x = fixture(),
    all = x.jobPages[0];
  x.jobPages = [
    { total_count: all.total_count, jobs: all.jobs.slice(0, 4) },
    { total_count: all.total_count, jobs: all.jobs.slice(4) },
  ];
  assert.equal((await decision(x)).allowed, true);
  x.jobPages[1].total_count++;
  assert.equal((await decision(x)).allowed, false);
});
test('CLI writes only a recovery decision using actual helper behavior', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-recovery-test-'));
  try {
    const x = fixture();
    writeFileSync(join(dir, 'planner'), JSON.stringify(x.planner));
    writeFileSync(join(dir, 'jobs'), JSON.stringify(x.jobPages));
    const env = {
      ...process.env,
      ALLOW_CLOUDFLARE_VERIFICATION_FAILURES: 'true',
      EVENT_NAME: x.eventName,
      CURRENT_REF_NAME: x.refName,
      EXPECTED_SHA: sha,
      TARGET_SHA: sha,
      RECOVERY_PLANNER_FILE: join(dir, 'planner'),
      RECOVERY_JOBS_FILE: join(dir, 'jobs'),
      GITHUB_OUTPUT: join(dir, 'output'),
    };
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        join(__dirname, 'check-production-migration-recovery.ts'),
      ],
      { env }
    );
    assert.equal(
      readFileSync(join(dir, 'output'), 'utf8'),
      'recovery_allowed=true\n'
    );
    writeFileSync(join(dir, 'jobs'), '{');
    assert.notEqual(
      spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          join(__dirname, 'check-production-migration-recovery.ts'),
        ],
        { env }
      ).status,
      0
    );
    assert.equal(
      readFileSync(join(dir, 'output'), 'utf8'),
      'recovery_allowed=true\n'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('workflow keeps default-off manual opt-in and full normal marker/staging/apply gates', () => {
  const yaml = readFileSync(
    join(__dirname, '../../.github/workflows/supabase-production.yaml'),
    'utf8'
  );
  assert.match(
    yaml,
    /allow_cloudflare_verification_failures:[\s\S]*type: boolean[\s\S]*default: false/
  );
  assert.match(yaml, /EVENT_NAME.*workflow_dispatch/);
  assert.match(yaml, /EXPECTED_SHA.*\^\[0-9a-f\]\{40\}/);
  assert.match(yaml, /gh api --paginate --slurp/);
  assert.match(yaml, /attempts\/\$PLANNER_ATTEMPT\/jobs/);
  assert.match(
    yaml,
    /node --experimental-strip-types scripts\/ci\/check-production-migration-recovery.ts/
  );
  assert.match(yaml, /RECOVERY_JOB_LOG_DIR="\$RECOVERY_DIR\/logs"/);
  assert.doesNotMatch(yaml, /cat "\$RECOVERY_DIR\/logs/);
  const { source: proof, command: proofCommand } = readStagingProof(yaml);
  assert.match(yaml, /DEPLOYMENT_MARKER_HAS_SUCCESS.*!= "true"/);
  assert.match(
    proof,
    /d\.sha === source\s*&&\s*d\.ref === source\s*&&[\s\S]*p\.sha === source/
  );
  assert.match(
    proof,
    /run\.status === 'completed'\s*&&\s*run\.conclusion === 'success'/
  );
  assert.match(proof, /run\.run_attempt === Number\(p\.runAttempt\)/);
  assert.match(proof, /run\.head_branch === 'main'/);
  assert.match(proof, /job\.run_attempt === run\.run_attempt/);
  assert.match(
    proof,
    /'Deploy migrations to staging',[\s\S]*'Record successful staging migration marker'/
  );
  assert.match(
    proof,
    /step\.status === 'completed'\s*&&\s*step\.conclusion === 'success'/
  );
  assert.ok(yaml.indexOf(proofCommand) < yaml.indexOf('SHOULD_DEPLOY=true'));
  assert.match(proof, /process\.exitCode = 1/);
  assert.match(yaml, /supabase db push --include-all/);
  assert.match(yaml, /expected_project_ref:/);
  assert.match(yaml, /PRODUCTION_PROJECT_ID.*!= "\$EXPECTED_PROJECT_REF"/);
  assert.ok(
    yaml.indexOf('production project binding does not match') <
      yaml.indexOf('supabase link --project-ref')
  );
  assert.match(yaml, /github.event.workflow_run.conclusion == 'success'/);
  assert.match(
    yaml,
    /if: steps\.evaluate\.outputs\.should_deploy == 'true'[\s\S]*PLANNER_RUN_ID: \$\{\{ steps\.evaluate\.outputs\.planner_run_id \}\}/
  );
  assert.match(
    yaml,
    /ALLOW_FAILED_PLANNER: \$\{\{ steps\.evaluate\.outputs\.recovery_allowed \}\}/
  );
  assert.ok(
    yaml.indexOf('Verify production marker producer') <
      yaml.indexOf('  deploy:\n')
  );
  assert.match(yaml, /needs: \[evaluate-prerequisites\]/);
  assert.match(
    yaml,
    /inputs\.user_ok_record_id != '' && inputs\.migration_patch_id != ''/
  );
  assert.match(yaml, /inputs\.list_only != true/);
});

test('actual project guard rejects a mismatched recovery secret without revealing either value', () => {
  const yaml = readFileSync(
    join(__dirname, '../../.github/workflows/supabase-production.yaml'),
    'utf8'
  );
  const begin = yaml.indexOf(
    '          if [ "$ALLOW_CLOUDFLARE_VERIFICATION_FAILURES" = "true" ] &&',
    yaml.indexOf('name: Deploy migrations to production')
  );
  const end = yaml.indexOf('          cd apps/database', begin);
  const guard = yaml.slice(begin, end);
  assert.ok(begin > 0 && end > begin);
  function run(allow, expected, actual) {
    return spawnSync('bash', ['-c', guard], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ALLOW_CLOUDFLARE_VERIFICATION_FAILURES: allow,
        EXPECTED_PROJECT_REF: expected,
        PRODUCTION_PROJECT_ID: actual,
      },
    });
  }
  // The step also fails closed unless the project is the public production
  // ref, so the matching binding uses that ref.
  const expected = 'nzamlzqfdwaaxdefwraj',
    actual = 'b'.repeat(20);
  const wrong = run('true', expected, actual);
  assert.equal(wrong.status, 1);
  assert.ok(!wrong.stdout.includes(expected) && !wrong.stdout.includes(actual));
  assert.equal(run('true', expected, expected).status, 0);
  assert.equal(run('true', '', expected).status, 1);
  assert.equal(run('false', '', expected).status, 0);
  const otherProject = run('false', '', actual);
  assert.equal(otherProject.status, 1);
  assert.ok(!`${otherProject.stdout}${otherProject.stderr}`.includes(actual));
});

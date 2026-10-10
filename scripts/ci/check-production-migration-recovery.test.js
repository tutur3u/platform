const test = require('node:test');
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
  assert.match(yaml, /DEPLOYMENT_MARKER_HAS_SUCCESS.*!= "true"/);
  assert.match(yaml, /STAGING_SHA.*!= "\$TARGET_SHA"/);
  assert.match(yaml, /STAGING_STATUS.*!= "completed"/);
  assert.match(yaml, /STAGING_CONCLUSION.*!= "success"/);
  assert.match(yaml, /supabase db push --include-all/);
  assert.match(yaml, /expected_project_ref:/);
  assert.match(yaml, /PRODUCTION_PROJECT_ID.*!= "\$EXPECTED_PROJECT_REF"/);
  assert.ok(
    yaml.indexOf('production project binding does not match') <
      yaml.indexOf('supabase link --project-ref')
  );
  assert.match(yaml, /github.event.workflow_run.conclusion == 'success'/);
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
  const expected = 'a'.repeat(20),
    actual = 'b'.repeat(20);
  const wrong = run('true', expected, actual);
  assert.equal(wrong.status, 1);
  assert.ok(!wrong.stdout.includes(expected) && !wrong.stdout.includes(actual));
  assert.equal(run('true', expected, expected).status, 0);
  assert.equal(run('true', '', expected).status, 1);
  assert.equal(run('false', '', expected).status, 0);
});

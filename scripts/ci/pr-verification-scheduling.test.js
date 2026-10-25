const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const workflows = readAllWorkflows();

const heavy = {
  'apps-cloudflare.yaml': [
    'validate',
    'restore-acceptance',
    'native-publication-profiles',
  ],
  'calendar-cloudflare.yaml': ['native-profiles'],
  'calendar-generation-contract.yaml': ['contract'],
  'colab-cloudflare.yaml': ['validate'],
  'connected-mail-accounts-contract.yaml': ['contract'],
  'coordination-cloudflare.yaml': ['validate'],
  'creator-identity-contract.yaml': ['contract'],
  'cron-control-cloudflare.yaml': ['validate'],
  'devbox-control-cloudflare.yaml': ['validate'],
  'discord-python-ci.yml': [
    'test',
    'test-coverage',
    'build-check',
    'matrix-test',
  ],
  'external-internal-packages.yaml': ['Build'],
  'external-project-storage-analytics-contract.yaml': ['contract'],
  'inventory-offline-contract.yaml': ['contract'],
  'lettin-cloudflare.yaml': ['validate'],
  'mail-calendar-tasks-builds.yaml': [
    'build-mail',
    'build-tasks',
    'build-web',
    'calendar-native',
    'calendar-artifact-restore',
  ],
  'mail-cloudflare.yaml': ['native-profiles'],
  'mail-profile-runtime-contract.yaml': ['runtime'],
  'meet-cloudflare.yaml': ['validate', 'restored-artifact'],
  'mobile.yaml': ['tests', 'realtime-parity', 'build'],
  'parley-cloudflare.yaml': ['validate'],
  'periodic-report-delivery-contract.yaml': ['contract'],
  'playground-runtime-acceptance.yaml': ['acceptance'],
  'programming-app-builds.yaml': ['build'],
  'programming-database-contract.yaml': ['contract'],
  'report-review-receipts-contract.yaml': ['contract'],
  'sdk-package-qualification.yaml': ['qualify'],
  'shortener-cloudflare.yaml': ['validate', 'restore-acceptance'],
  'sso-persistence-contract.yaml': ['contract'],
  'time-tracker-control-contract.yaml': ['contract'],
  'topic-delivery-foundation-contract.yaml': ['contract'],
  'tsrs-shadow.yaml': ['shadow'],
  'tutoring-absence-credit-contract.yaml': ['contract'],
  'tutoring-teacher-hours-contract.yaml': ['contract'],
};
for (const platform of ['android', 'ios', 'linux', 'macos', 'windows']) {
  heavy[`mobile-build-${platform}.yaml`] = [`build-${platform}`];
}

function context(event, draft) {
  return {
    github: {
      event_name: event,
      ref: event === 'pull_request' ? 'refs/pull/42/merge' : 'refs/heads/main',
      event: event === 'pull_request' ? { pull_request: { draft } } : {},
    },
  };
}

// Model job admission, including implicit success() and explicitly always-run
// summaries, so a skipped preflight cannot conceal an allocated heavy runner.
function admitted(workflow, id, scope) {
  const job = workflow.jobs[id];
  assert.ok(job, `Missing job ${id}`);
  const dependencies = [job.needs || []].flat();
  const needs = Object.fromEntries(
    dependencies.map((dependency) => {
      const result = admitted(workflow, dependency, scope)
        ? 'success'
        : 'skipped';
      return [
        dependency,
        {
          result,
          outputs:
            result === 'success'
              ? {
                  should_run: 'true',
                  run_checks: 'true',
                  run: 'true',
                  affected_jobs: '{}',
                }
              : {},
        },
      ];
    })
  );
  if (
    !/\b(always|cancelled|failure|success)\(/u.test(job.if || '') &&
    Object.values(needs).some((dependency) => dependency.result !== 'success')
  )
    return false;
  return !job.if || Boolean(evaluateExpression(job.if, { ...scope, needs }));
}

for (const [file, jobs] of Object.entries(heavy)) {
  test(`${file}: draft defers heavy runners and readiness admits them`, () => {
    const workflow = workflows[file];
    assert.deepEqual(workflow.on.pull_request.types, [
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
      'converted_to_draft',
    ]);
    for (const id of jobs) {
      assert.equal(
        admitted(workflow, id, context('pull_request', true)),
        false,
        `${id}: draft`
      );
      assert.equal(
        admitted(workflow, id, context('pull_request', false)),
        true,
        `${id}: ready`
      );
    }
  });
}

test('drafts retain light PR checks and every security job', () => {
  for (const [file, ids] of Object.entries({
    'mobile.yaml': ['quality', 'semantic-pull-request'],
    'discord-python-ci.yml': ['lint', 'type-check', 'security'],
    'i18n-check.yaml': [
      'i18n-sort-check',
      'i18n-translation-check',
      'i18n-key-parity-check',
      'i18n-namespace-check',
    ],
    'docs-seo-check.yaml': ['validate'],
    'security-checks.yaml': ['scope', 'secrets'],
    'codeql.yml': ['scope', 'analyze'],
    'security-egress-contract.yaml': ['check-ci', 'contract'],
    'security-review-classifier.yaml': ['classify'],
  })) {
    for (const id of ids) {
      assert.equal(
        admitted(workflows[file], id, context('pull_request', true)),
        true,
        `${file}:${id}`
      );
    }
  }
});

test('conversion to draft replaces superseded security runs with admitted security jobs', () => {
  for (const [file, job] of [
    ['codeql.yml', 'analyze'],
    ['security-egress-contract.yaml', 'contract'],
  ]) {
    const workflow = workflows[file];
    assert.ok(workflow.on.pull_request.types.includes('converted_to_draft'));
    const run = (draft, action, runId) => {
      const scope = context('pull_request', draft);
      Object.assign(scope.github, {
        workflow: workflow.name,
        sha: 'same-head',
        run_id: runId,
        run_attempt: 1,
      });
      scope.github.event.action = action;
      scope.github.event.pull_request.number = 42;
      return scope;
    };
    const ready = run(false, 'synchronize', 1);
    const draft = run(true, 'converted_to_draft', 2);
    assert.equal(
      renderTemplate(workflow.concurrency.group, ready),
      renderTemplate(workflow.concurrency.group, draft)
    );
    assert.equal(
      evaluateExpression(workflow.concurrency['cancel-in-progress'], draft),
      true
    );
    assert.equal(
      admitted(workflow, job, ready),
      true,
      `${file}: initial security run`
    );
    assert.equal(
      admitted(workflow, job, draft),
      true,
      `${file}: replacement security run`
    );
  }
});

test('mobile aggregate still requires every quality, test and parity result', () => {
  const job = workflows['mobile.yaml'].jobs.build;
  assert.deepEqual(job.needs, [
    'check-ci',
    'quality',
    'tests',
    'realtime-parity',
  ]);
  const guard = job.steps.find(
    (step) => step.name === 'Require every mobile check'
  );
  assert.equal(
    guard.run,
    'test "$QUALITY_RESULT" = success && test "$TEST_RESULT" = success && test "$REALTIME_RESULT" = success'
  );
});

test('nightly, release and manual Apple/Windows checks retain platform builds', () => {
  for (const [platform, cron] of [
    ['ios', '10 18 * * *'],
    ['macos', '30 18 * * *'],
    ['windows', '50 18 * * *'],
  ]) {
    const workflow = workflows[`mobile-build-${platform}.yaml`];
    assert.equal(workflow.on.push, undefined);
    assert.deepEqual(workflow.on.schedule, [{ cron }]);
    assert.deepEqual(workflow.on.release.types, ['published']);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    for (const event of ['schedule', 'release', 'workflow_dispatch']) {
      assert.equal(
        admitted(workflow, `build-${platform}`, context(event)),
        true,
        `${platform}:${event}`
      );
    }
  }
});

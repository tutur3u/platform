const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const {
  ADMISSION_PR_WORKFLOWS,
  ALWAYS_ON_PR_WORKFLOWS,
  HEAVY_PR_WORKFLOWS,
  PAUSED_PR_WORKFLOWS,
  PR_LABEL_GATE,
  protectedTriggerDigest,
  PUSH_TO_PR,
  READY_LABEL,
  UNADMITTED_GROUP_SUFFIX,
  withoutPrLabelGate,
} = require('./pr-label-gate');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const workflows = readAllWorkflows(undefined, { raw: true });
const PAUSED_JOB = /^(\$\{\{ )?false( \}\})?$/u;
// Trigger digests on origin/main when the gate landed. Update a digest only
// with a reviewed push, schedule or manual trigger change.
const PROTECTED_TRIGGERS = {
  'ai-cloudflare.yaml': '1e5f4be0329251eb',
  'api-worker.yaml': '058d68d5d261d527',
  'apps-cloudflare.yaml': '5dadb22de50806df',
  'biome-check.yaml': '47acd08d33c6cf4c',
  'calendar-cloudflare.yaml': 'e3e096233a6e8a60',
  'calendar-generation-contract.yaml': '0a3cc2c97958f5cd',
  'cms-cloudflare.yaml': '5f4174ce584d0533',
  'codeql.yml': '4a4a1b519370f1bc',
  'colab-cloudflare.yaml': 'dce28d216351f5af',
  'connected-mail-accounts-contract.yaml': '36344b32dd7e88da',
  'contacts-start-candidate.yaml': '0a3cc2c97958f5cd',
  'coordination-cloudflare.yaml': '5d9dda0ceaa00a84',
  'creator-identity-contract.yaml': '0a3cc2c97958f5cd',
  'cron-control-cloudflare.yaml': 'f9a9bce5ac1972dd',
  'desktop-beta.yaml': '3d1e23b37a961485',
  'devbox-control-cloudflare.yaml': 'af0d91d571550c3f',
  'discord-python-ci.yml': 'df10679b45d420bb',
  'docs-seo-check.yaml': '6305e545b85b27e8',
  'external-internal-packages.yaml': '4d532cf88497bbd2',
  'external-project-storage-analytics-contract.yaml': '02e3e1d0d939ac56',
  'finance-cloudflare.yaml': 'd5dc7fa96048fd6b',
  'forms-cloudflare.yaml': '4c98fb3cb1df4d96',
  'i18n-check.yaml': '6305e545b85b27e8',
  'inventory-cloudflare.yaml': '4558d318d6aaaba3',
  'inventory-offline-contract.yaml': '0a3cc2c97958f5cd',
  'lettin-cloudflare.yaml': 'd043498fabfde801',
  'mail-calendar-tasks-builds.yaml': '25ba8eefde41880f',
  'mail-cloudflare.yaml': 'dd965acde3d1fd0a',
  'mail-profile-runtime-contract.yaml': '44136fa355b3678a',
  'meet-cloudflare.yaml': '94511c89d2621e60',
  'mobile-build-android.yaml': 'ef27f9c72cee2485',
  'mobile-build-ios.yaml': '1223a8396111881f',
  'mobile-build-linux.yaml': '7469a02578f1c4c3',
  'mobile-build-macos.yaml': 'cca5083fd78920dc',
  'mobile-build-windows.yaml': 'ff0b86edd5297973',
  'mobile.yaml': '2bd82a7675ba9ab3',
  'nova-cloudflare.yaml': '2033d2d0bbf8194b',
  'parley-cloudflare.yaml': 'f1777123fb48e37c',
  'periodic-report-delivery-contract.yaml': 'dc372af9059d0c07',
  'playground-runtime-acceptance.yaml': '0a3cc2c97958f5cd',
  'programming-app-builds.yaml': '0a3cc2c97958f5cd',
  'programming-database-contract.yaml': '0a3cc2c97958f5cd',
  'report-review-receipts-contract.yaml': '433352a4fb0e56e6',
  'required-account-mfa-contract.yaml': 'f803778bc2859492',
  'sdk-package-qualification.yaml': '0a3cc2c97958f5cd',
  'security-egress-contract.yaml': '0a3cc2c97958f5cd',
  'shortener-cloudflare.yaml': '95e0a84a4fdf354e',
  'sso-persistence-contract.yaml': '939d2042696cddd9',
  'storefront-cloudflare.yaml': 'a9efe716b3f7059c',
  'supabase-baseline.yaml': 'dcdf48b8132ff123',
  'task-board-database-contract.yaml': '0a3cc2c97958f5cd',
  'time-tracker-control-contract.yaml': '25ad429ead647fb8',
  'topic-delivery-foundation-contract.yaml': '6880af5bb579ac39',
  'track-cloudflare.yaml': '9c02c75a8da5ddae',
  'tsrs-shadow.yaml': '0b7a9bf95294a1fd',
  'turbo-cache-cloudflare.yaml': 'c8aeb63fcad4a92e',
  'turbo-unit-tests.yaml': 'e94a048af91d2cc0',
  'tutoring-absence-credit-contract.yaml': 'f0f9259c069d33ec',
  'tutoring-teacher-hours-contract.yaml': 'cb666f22d4bbdc8f',
  'type-check.yaml': '47acd08d33c6cf4c',
  'web-start-candidate.yaml': '0a3cc2c97958f5cd',
};

function events(workflow) {
  const on = workflow.on;
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on))
    return Object.fromEntries(on.map((event) => [event, null]));
  return on;
}

function prReachable(workflow) {
  const on = events(workflow);
  if (Object.hasOwn(on, 'pull_request')) return true;
  if (Object.hasOwn(on, 'pull_request_target')) return true;
  if (!Object.hasOwn(on, 'push')) return false;
  const branches = on.push?.branches;
  return !branches || branches.some((b) => !['main', 'production'].includes(b));
}

function pullRequest(labels, action = 'synchronize', label) {
  return {
    github: {
      event_name: 'pull_request',
      event: {
        action,
        ...(label ? { label: { name: label } } : {}),
        pull_request: { labels: labels.map((name) => ({ name })) },
      },
    },
  };
}

test('the gate admits only ready-for-ci PRs and never gates other events', () => {
  const gate = (scope) => evaluateExpression(PR_LABEL_GATE, scope);
  assert.equal(gate(pullRequest([])), false);
  assert.equal(gate(pullRequest(['WIP'])), false);
  assert.equal(gate(pullRequest([READY_LABEL])), true);
  assert.equal(
    gate(pullRequest([READY_LABEL], 'labeled', READY_LABEL)),
    true,
    'adding the label starts CI'
  );
  assert.equal(
    gate(pullRequest([READY_LABEL, 'WIP'], 'labeled', 'WIP')),
    true,
    'any label event on a ready PR is a real admitted run, never a skipped mask'
  );
  assert.equal(
    gate(pullRequest(['WIP'], 'labeled', 'WIP')),
    false,
    'other labels never admit an unready PR'
  );
  for (const event_name of ['push', 'workflow_dispatch', 'schedule']) {
    assert.equal(gate({ github: { event_name, event: {} } }), true);
  }
});

test('every PR-reachable workflow is classified exactly once', () => {
  const classified = [
    ...HEAVY_PR_WORKFLOWS,
    ...ADMISSION_PR_WORKFLOWS,
    ...ALWAYS_ON_PR_WORKFLOWS,
    ...PAUSED_PR_WORKFLOWS,
  ];
  assert.equal(new Set(classified).size, classified.length);
  const reachable = Object.keys(workflows).filter((file) =>
    prReachable(workflows[file])
  );
  assert.deepEqual([...classified].sort(), reachable.sort());
});

for (const file of HEAVY_PR_WORKFLOWS) {
  test(`${file}: every PR job carries the ready-for-ci gate`, () => {
    const workflow = workflows[file];
    const pr = events(workflow).pull_request;
    assert.ok(pr, 'heavy workflows validate PRs through pull_request');
    for (const type of [
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
      'labeled',
    ]) {
      assert.ok(pr.types?.includes(type), `missing ${type}`);
    }
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const condition = String(job.if ?? '');
      if (PAUSED_JOB.test(condition)) continue;
      assert.ok(
        condition === PR_LABEL_GATE ||
          withoutPrLabelGate(condition) !== condition,
        // Gating callers (not callees) means a skipped caller never starts
        // its reusable workflow, so no callee check is left pending.
        `${id}: job-level gate missing or not ANDed at top level`
      );
    }
    const groups = workflow.concurrency
      ? [workflow.concurrency.group]
      : Object.values(workflow.jobs)
          .map((job) => job.concurrency)
          .filter((c) => c && c['cancel-in-progress'] !== false)
          .map((c) => c.group);
    assert.ok(groups.length, 'PR runs need a superseding group');
    // A label event on a ready PR lands in the push run's group and cancels
    // it, so the newest check per name is always the admitted rerun.
    const scope = (action, label, labels = [READY_LABEL, 'WIP']) => ({
      github: {
        ...pullRequest([READY_LABEL, 'WIP'], action, label).github,
        workflow: workflow.name,
        ref: 'refs/pull/42/merge',
        sha: 'head',
        run_id: action === 'labeled' ? 2 : 1,
        run_attempt: 1,
        event: {
          ...pullRequest([READY_LABEL, 'WIP'], action, label).github.event,
          pull_request: {
            number: 42,
            labels: labels.map((name) => ({ name })),
          },
        },
      },
    });
    const push = scope('synchronize');
    const labelled = scope('labeled', 'WIP');
    // A push whose payload predates the label never shares (or cancels) the
    // admitted run's group.
    const unadmitted = scope('synchronize', undefined, ['WIP']);
    for (const policy of workflow.concurrency
      ? [workflow.concurrency]
      : Object.values(workflow.jobs)
          .map((job) => job.concurrency)
          .filter((c) => c && c['cancel-in-progress'] !== false)) {
      assert.equal(
        renderTemplate(policy.group, labelled),
        renderTemplate(policy.group, push),
        'label events must share the admitted run group'
      );
      assert.ok(policy.group.endsWith(UNADMITTED_GROUP_SUFFIX), policy.group);
      assert.notEqual(
        renderTemplate(policy.group, unadmitted),
        renderTemplate(policy.group, labelled),
        'unadmitted runs must never cancel an admitted run'
      );
      if (policy.queue !== 'max') {
        assert.equal(
          evaluateExpression(String(policy['cancel-in-progress']), labelled),
          true
        );
      }
    }
  });
}

for (const file of [...ALWAYS_ON_PR_WORKFLOWS, ...PAUSED_PR_WORKFLOWS]) {
  test(`${file}: cheap and paused PR checks carry no label gate`, () => {
    const text = JSON.stringify(workflows[file]);
    assert.doesNotMatch(text, new RegExp(READY_LABEL, 'u'));
    assert.ok(
      !events(workflows[file]).pull_request?.types?.includes('labeled')
    );
  });
}

test('main, production, schedule and manual triggers are untouched', () => {
  assert.deepEqual(
    Object.keys(PROTECTED_TRIGGERS).sort(),
    [...HEAVY_PR_WORKFLOWS].sort()
  );
  for (const file of HEAVY_PR_WORKFLOWS) {
    assert.equal(
      protectedTriggerDigest(file, workflows[file].on),
      PROTECTED_TRIGGERS[file],
      file
    );
  }
  for (const [file, branches] of Object.entries(PUSH_TO_PR)) {
    const push = events(workflows[file]).push;
    assert.deepEqual(push.branches, branches, file);
    assert.equal(push['branches-ignore'], undefined, file);
  }
});

test('the unwrap is exact for plain, expression and missing conditions', () => {
  const plain = "needs.check-ci.outputs.should_run == 'true'";
  assert.equal(withoutPrLabelGate(`(${plain}) && (${PR_LABEL_GATE})`), plain);
  assert.equal(
    withoutPrLabelGate(`\${{ (${plain}) && (${PR_LABEL_GATE}) }}`),
    `\${{ ${plain} }}`
  );
  assert.equal(withoutPrLabelGate(PR_LABEL_GATE), undefined);
  assert.equal(withoutPrLabelGate(plain), plain);
});

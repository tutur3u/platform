const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const {
  ADMISSION_PR_WORKFLOWS,
  REUSABLE_GATED_WORKFLOWS,
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
const {
  readAllWorkflows,
  workflowsDir,
} = require('./workflow-yaml-test-helper');

const workflows = readAllWorkflows(undefined, { raw: true });
const PAUSED_JOB = /^(\$\{\{ )?false( \}\})?$/u;
// Trigger digests on origin/main when the gate landed. Update a digest only
// with a reviewed push, schedule or manual trigger change.
const PROTECTED_TRIGGERS = {
  'rewise-cloudflare.yaml': 'fe6b54462e91b1bf',
  'git-cloudflare.yaml': '518ca2530d7a63ef',
  'external-cloudflare.yaml': '0a3cc2c97958f5cd',
  'ai-cloudflare.yaml': '2b1f1ae8795d0216',
  'api-worker.yaml': '058d68d5d261d527',
  'app-builds-affected.yaml': 'fcb6485f818aa571',
  'apps-cloudflare.yaml': '257f752668dce766',
  'oxc-check.yaml': '6c39e758f15186ed',
  'calendar-cloudflare.yaml': 'e3e096233a6e8a60',
  'calendar-generation-contract.yaml': '0a3cc2c97958f5cd',
  'cms-cloudflare.yaml': 'c43009624296a37c',
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
  'docs-seo-check.yaml': '78c7f5ff99020ac9',
  'external-internal-packages.yaml': '4d532cf88497bbd2',
  'external-project-page-versions-contract.yaml': '0a3cc2c97958f5cd',
  'external-project-storage-analytics-contract.yaml': '02e3e1d0d939ac56',
  'fee-lock-database-contract.yaml': '0a3cc2c97958f5cd',
  // Finance also watches its owning input-cache action; other trigger fields stay fixed.
  'finance-cloudflare.yaml': 'fabf7d45e110e58d',
  'forms-cloudflare.yaml': '0e554fe52a0af9c8',
  'i18n-check.yaml': '78c7f5ff99020ac9',
  'inventory-cloudflare.yaml': '56aef454e313add1',
  'inventory-offline-contract.yaml': '0a3cc2c97958f5cd',
  'lettin-cloudflare.yaml': 'd043498fabfde801',
  'mail-calendar-tasks-builds.yaml': '25ba8eefde41880f',
  'mail-cloudflare.yaml': 'dd965acde3d1fd0a',
  'mail-profile-runtime-contract.yaml': '44136fa355b3678a',
  'mastermind-cloudflare.yaml': 'd1f8275025d3586a',
  'meet-cloudflare.yaml': 'f3e7c418a0e49ecb',
  'mobile-build-android.yaml': 'ef27f9c72cee2485',
  'mobile-build-ios.yaml': '1223a8396111881f',
  'mobile-build-linux.yaml': '7469a02578f1c4c3',
  'mobile-build-macos.yaml': 'cca5083fd78920dc',
  'mobile-build-windows.yaml': 'ff0b86edd5297973',
  // Add only the checksum-pinned native input action to push/PR paths.
  'mobile.yaml': 'ed6d793aecbe7293',
  'nova-cloudflare.yaml': 'a2d9cd99b1329afe',
  'ops-hub-cloudflare.yaml': '0a3cc2c97958f5cd',
  'parley-cloudflare.yaml': 'f1777123fb48e37c',
  'pay-cloudflare.yaml': 'a31b0975203c9817',
  'periodic-report-delivery-contract.yaml': 'dc372af9059d0c07',
  'playground-cloudflare.yaml': '7c22fc6d616e6d01',
  'playground-runtime-acceptance.yaml': '0a3cc2c97958f5cd',
  'programming-database-contract.yaml': '0a3cc2c97958f5cd',
  'report-review-receipts-contract.yaml': '433352a4fb0e56e6',
  'required-account-mfa-contract.yaml': 'f803778bc2859492',
  'roadmap-cloudflare.yaml': '226a232389cbc09b',
  'sdk-package-qualification.yaml': '0a3cc2c97958f5cd',
  'security-egress-contract.yaml': '0a3cc2c97958f5cd',
  'shortener-cloudflare.yaml': '91506e88fa4e6dd8',
  'sso-persistence-contract.yaml': '939d2042696cddd9',
  'storefront-cloudflare.yaml': '1e3b010d7a0ce910',
  'supabase-baseline.yaml': 'dcdf48b8132ff123',
  'task-board-database-contract.yaml': '0a3cc2c97958f5cd',
  'time-tracker-control-contract.yaml': '25ad429ead647fb8',
  'tools-cloudflare.yaml': 'a17e28a9976d224b',
  'topic-delivery-foundation-contract.yaml': '6880af5bb579ac39',
  'track-cloudflare.yaml': 'f354cac2984f6165',
  'tsrs-shadow.yaml': '0b7a9bf95294a1fd',
  'turbo-cache-cloudflare.yaml': 'c8aeb63fcad4a92e',
  'turbo-unit-tests.yaml': 'e94a048af91d2cc0',
  'tutoring-absence-credit-contract.yaml': 'f0f9259c069d33ec',
  'tutoring-teacher-hours-contract.yaml': 'cb666f22d4bbdc8f',
  'type-check.yaml': '47acd08d33c6cf4c',
  'web-start-candidate.yaml': '0a3cc2c97958f5cd',
  'workspace-permission-scope-contract.yaml': '0a3cc2c97958f5cd',
  'chat-cloudflare.yaml': '4c7010c51cef2ee2',
  'drive-cloudflare-artifact.yaml': '0a3cc2c97958f5cd',
  'hive-cloudflare.yaml': '170330c93275beda',
  'infrastructure-cloudflare.yaml': '8b74315dfe557569',
  'learn-cloudflare.yaml': 'c1dc547df2674fca',
  'marketing-cloudflare.yaml': '975602b8f7271cbc',
  'mind-cloudflare.yaml': '188b2dc67dc86f60',
  'teach-cloudflare.yaml': 'b37341dc49021b0b',
  'workspace-cloudflare.yaml': '659081e2b1855001',
};

const EXTRA_PROTECTED_INPUTS = {
  'ai-cloudflare.yaml': ['scripts/ci/ai-cutover-smoke.mjs'],
  'cms-cloudflare.yaml': ['scripts/ci/cms-cutover-smoke.mjs'],
  'finance-cloudflare.yaml': ['scripts/ci/finance-cutover-*'],
};

function assertProtectedTriggers(file, on) {
  const triggers = structuredClone(on);
  for (const input of EXTRA_PROTECTED_INPUTS[file] ?? []) {
    assert.ok(
      triggers.push.paths.includes(input),
      `${file} must watch ${input}`
    );
    triggers.push.paths = triggers.push.paths.filter((path) => path !== input);
  }
  assert.equal(
    protectedTriggerDigest(file, triggers),
    PROTECTED_TRIGGERS[file],
    file
  );
}

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
  return (
    !branches ||
    branches.some(
      (b) => !['main', 'production', 'release-please--branches--**'].includes(b)
    )
  );
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

function assertGeneratedWorkflowGates(file, workflow) {
  assert.ok(
    HEAVY_PR_WORKFLOWS.includes(file),
    `${file}: generated workflow is not heavy`
  );
  assert.ok(workflow.jobs?.['check-ci'], `${file}: missing check-ci job`);
  const ids = Object.keys(workflow.jobs).filter((id) => id !== 'affected-gate');
  assert.ok(ids.length >= 2, `${file}: missing qualification job`);
  for (const id of ids) {
    assert.ok(workflow.jobs?.[id], `${file}: missing ${id} job`);
    assert.ok(
      String(workflow.jobs[id].if ?? '').includes(PR_LABEL_GATE),
      `${file}: ${id} ready-for-ci gate missing`
    );
  }
}

test('generated start-bridge workflows are heavy and ready-for-ci gated', () => {
  const generated = fs.readdirSync(workflowsDir).filter((file) => {
    if (!file.endsWith('.yaml')) return false;
    return fs
      .readFileSync(path.join(workflowsDir, file), 'utf8')
      .split(/\r?\n/u, 1)[0]
      .includes('Generated by the start-bridge codemod');
  });
  for (const file of generated)
    assertGeneratedWorkflowGates(file, workflows[file]);
  assert.ok(generated.length > 0, 'expected generated workflows');
});

test('generated workflow gate assertion rejects a gate-removed in-memory copy', () => {
  const file = fs
    .readdirSync(workflowsDir)
    .find(
      (name) =>
        name.endsWith('.yaml') &&
        fs
          .readFileSync(path.join(workflowsDir, name), 'utf8')
          .split(/\r?\n/u, 1)[0]
          .includes('Generated by the start-bridge codemod')
    );
  assert.ok(file, 'expected generated workflow');
  const mutated = structuredClone(workflows[file]);
  mutated.jobs['check-ci'].if = 'true';
  assert.throws(
    () => assertGeneratedWorkflowGates(file, mutated),
    /check-ci ready-for-ci gate missing/u
  );
});

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

for (const file of [...HEAVY_PR_WORKFLOWS, ...REUSABLE_GATED_WORKFLOWS]) {
  test(`${file}: every PR job carries the ready-for-ci gate`, () => {
    const workflow = workflows[file];
    const pr =
      events(workflow).pull_request ??
      events(workflows['pr-checks.yaml']).pull_request;
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
      const admittedGroup = renderTemplate(policy.group, labelled);
      if (admittedGroup === `${workflow.name}-pr-42`) {
        // One pull-request slot. A later admitted run cancels the older one,
        // including a run whose payload had not yet received ready-for-ci.
        assert.equal(
          renderTemplate(policy.group, unadmitted),
          admittedGroup,
          'one pull request uses one group'
        );
      } else {
        assert.ok(policy.group.endsWith(UNADMITTED_GROUP_SUFFIX), policy.group);
        assert.notEqual(
          renderTemplate(policy.group, unadmitted),
          admittedGroup,
          'unadmitted runs must never cancel an admitted run'
        );
      }
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
    [...HEAVY_PR_WORKFLOWS, ...REUSABLE_GATED_WORKFLOWS].sort()
  );
  for (const file of [...HEAVY_PR_WORKFLOWS, ...REUSABLE_GATED_WORKFLOWS]) {
    assertProtectedTriggers(file, workflows[file].on);
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

test('heavy job conditions reject unlabelled events for humans, bots, fleet and stacks', () => {
  for (const file of HEAVY_PR_WORKFLOWS) {
    const workflow = workflows[file];
    const needs = Object.fromEntries(
      Object.keys(workflow.jobs).map((id) => [
        id,
        {
          result: 'success',
          outputs: {
            should_run: 'true',
            run_checks: 'true',
            affected_jobs: '{}',
          },
        },
      ])
    );
    for (const actor of [
      'Sokora',
      'vhpx',
      'dependabot[bot]',
      'claude[bot]',
      'github-actions[bot]',
    ]) {
      for (const action of ['opened', 'synchronize', 'reopened', 'labeled']) {
        for (const base of ['main', 'chore/stack-parent']) {
          const scope = {
            ...pullRequest([], action),
            needs,
            inputs: {},
          };
          scope.github.actor = actor;
          scope.github.ref = 'refs/pull/42/merge';
          scope.github.event.pull_request.draft = false;
          scope.github.event.pull_request.base = { ref: base };
          const ready = structuredClone(scope);
          ready.github.event.pull_request.labels = [{ name: READY_LABEL }];
          for (const [id, job] of Object.entries(workflow.jobs)) {
            const context = `${file}/${id}: ${actor}, ${action}, base=${base}`;
            assert.equal(
              Boolean(evaluateExpression(job.if, scope)),
              false,
              context
            );
            const original = withoutPrLabelGate(job.if);
            assert.equal(
              Boolean(evaluateExpression(job.if, ready)),
              original === undefined ||
                Boolean(evaluateExpression(original, ready)),
              `${context}: labelled runs preserve the original job condition`
            );
          }
        }
      }
    }
  }
});

function assertProtectedPush(file, push) {
  assert.ok(
    push?.branches?.length,
    `${file}: push needs explicit protected branches`
  );
  assert.equal(push['branches-ignore'], undefined, file);
  for (const branch of push.branches) {
    assert.ok(
      ['main', 'production', 'release-please--branches--**'].includes(branch),
      `${file}: ${branch} admits feature-branch pushes outside PR admission`
    );
  }
}

test('heavy workflows cannot start feature-branch push builds', () => {
  for (const file of HEAVY_PR_WORKFLOWS) {
    const on = events(workflows[file]);
    if (Object.hasOwn(on, 'push')) assertProtectedPush(file, on.push);
  }
  const push = events(workflows['mail-calendar-tasks-builds.yaml']).push;
  for (const branches of [
    undefined,
    ['**'],
    ['main', 'feature/**'],
    ['main', '!production'],
  ]) {
    assert.throws(() =>
      assertProtectedPush('feature-bypass', { ...push, branches })
    );
  }
});

test('reported build push selectors preserve protected refs and release branches', () => {
  assert.deepEqual(
    events(workflows['mail-calendar-tasks-builds.yaml']).push.branches,
    ['main']
  );
  assert.equal(
    events(workflows['programming-app-builds.yaml']).push,
    undefined
  );
  assert.deepEqual(events(workflows['i18n-check.yaml']).push.branches, [
    'main',
    'production',
  ]);
  for (const file of [
    'turbo-unit-tests.yaml',
    'type-check.yaml',
    'oxc-check.yaml',
  ]) {
    assert.deepEqual(
      events(workflows[file]).push.branches,
      ['main', 'production', 'release-please--branches--**'],
      file
    );
  }
  const release = workflows['release-please.yaml'];
  assert.match(
    JSON.stringify(release),
    /release-please--branches--production/u
  );
  assert.match(
    JSON.stringify(release),
    /release-please--branches--production--release-notes/u
  );
});

test('roadmap artifact admission rejects unlabelled PRs and preserves main dispatch', () => {
  const jobs = workflows['roadmap-cloudflare.yaml'].jobs;
  const decide = (event, labels, ref, relevant = true) => {
    const context = {
      github: {
        event_name: event,
        ref,
        event: { pull_request: { labels: labels.map((name) => ({ name })) } },
      },
      needs: {
        'check-ci': { outputs: { should_run: String(relevant) } },
        'affected-gate': { outputs: { run: 'true' } },
      },
    };
    return Object.fromEntries(
      Object.entries(jobs).map(([id, job]) => [
        id,
        evaluateExpression(job.if, context),
      ])
    );
  };
  assert.deepEqual(decide('pull_request', [], 'refs/pull/42/merge'), {
    'affected-gate': false,
    'check-ci': false,
    build: false,
  });
  assert.deepEqual(
    decide('pull_request', [READY_LABEL], 'refs/pull/42/merge'),
    { 'affected-gate': true, 'check-ci': true, build: true }
  );
  assert.equal(
    decide('pull_request', [READY_LABEL], 'refs/pull/42/merge', false).build,
    false
  );
  assert.equal(decide('workflow_dispatch', [], 'refs/heads/main').build, true);
  assert.equal(
    decide('workflow_dispatch', [], 'refs/heads/unreviewed').build,
    false
  );
});

test('exact smoke-input additions preserve every other protected trigger input', () => {
  const file = 'ai-cloudflare.yaml';
  const on = workflows[file].on;
  assertProtectedTriggers(file, on);
  for (const path of ['apps/ai/**', 'scripts/ci/ai-cutover-smoke.mjs']) {
    const changed = structuredClone(on);
    changed.push.paths = changed.push.paths.filter((input) => input !== path);
    assert.throws(() => assertProtectedTriggers(file, changed));
  }
  const widened = structuredClone(on);
  widened.push.paths.push('unreviewed/**');
  assert.throws(() => assertProtectedTriggers(file, widened));
});

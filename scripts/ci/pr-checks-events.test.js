const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const workflow = readWorkflow('pr-checks.yaml', { raw: true });
const admission = readWorkflow('ci-admitted.yaml', { raw: true });
const categories = ['oxc', 'i18n', 'docs', 'migrations', 'mobile', 'plugin'];
const callers = [
  'oxc',
  'i18n',
  'docs',
  'migration-timestamps',
  'migrations',
  'mobile',
  'plugin',
];
function context(action = 'synchronize', label, ready = true, run = 1) {
  return {
    github: {
      workflow: workflow.name,
      event_name: 'pull_request',
      head_ref: 'fix/example',
      base_ref: 'main',
      ref: 'refs/pull/42/merge',
      sha: 'head',
      run_id: run,
      run_attempt: 1,
      event: {
        action,
        label: { name: label },
        pull_request: {
          number: 42,
          labels: ready ? [{ name: 'ready-for-ci' }] : [],
        },
      },
    },
  };
}
function runnable(id, ctx, results = {}) {
  const job = workflow.jobs[id];
  assert.ok(job, `missing ${id}`);
  const dependencies = [job.needs || []].flat();
  const needs = Object.fromEntries(
    dependencies.map((name) => [
      name,
      results[name] || {
        result: 'success',
        outputs: Object.fromEntries(categories.map((key) => [key, 'true'])),
      },
    ])
  );
  if (
    !/\b(always|cancelled|success|failure)\(/u.test(job.if || '') &&
    Object.values(needs).some((job) => job.result !== 'success')
  )
    return false;
  return !job.if || Boolean(evaluateExpression(job.if, { ...ctx, needs }));
}
function gate(results, ctx) {
  const step = workflow.jobs.gate.steps[0];
  const script = step.run
    .replace("node - <<'NODE'\n", '')
    .replace(/\nNODE\s*$/u, '');
  const env = Object.fromEntries(
    Object.entries(step.env).map(([key, value]) => [
      key,
      String(evaluateExpression(value, { ...ctx, needs: results })),
    ])
  );
  return spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('unrelated label events run only admission and the aggregate', () => {
  for (const ready of [true, false])
    for (const action of ['labeled', 'unlabeled']) {
      const ctx = context(action, 'security-review-required', ready);
      assert.equal(runnable('scope', ctx), false);
      assert.equal(runnable('branch-name', ctx), false);
      const results = { scope: { result: 'skipped', outputs: {} } };
      for (const id of callers)
        assert.equal(runnable(id, ctx, results), false, id);
      assert.equal(runnable('admitted', ctx, results), true);
      assert.equal(runnable('gate', ctx, results), true);
      const completed = Object.fromEntries(
        Object.keys(workflow.jobs)
          .filter((id) => id !== 'gate')
          .map((id) => [
            id,
            { result: id === 'admitted' ? 'success' : 'skipped', outputs: {} },
          ])
      );
      assert.equal(gate(completed, ctx).status, 0);
      completed.admitted.result = 'failure';
      assert.equal(gate(completed, ctx).status, 1);
    }
});

test('ready-for-ci label changes retain full selection and readiness admission', () => {
  for (const [action, ready] of [
    ['labeled', true],
    ['unlabeled', false],
  ]) {
    const ctx = context(action, 'ready-for-ci', ready);
    assert.equal(runnable('scope', ctx), true);
    assert.equal(runnable('branch-name', ctx), true);
    for (const id of ['oxc', 'i18n', 'docs'])
      assert.equal(runnable(id, ctx), ready, id);
    for (const id of ['migration-timestamps', 'migrations', 'mobile', 'plugin'])
      assert.equal(runnable(id, ctx), true, id);
  }
});

test('a failed branch check leaves selected validation eligible but fails the aggregate', () => {
  assert.ok(workflow.jobs['branch-name']);
  const ctx = context();
  const results = { 'branch-name': { result: 'failure', outputs: {} } };
  for (const id of callers) assert.equal(runnable(id, ctx, results), true, id);
  const completed = Object.fromEntries(
    Object.keys(workflow.jobs)
      .filter((id) => id !== 'gate')
      .map((id) => [
        id,
        {
          result: id === 'branch-name' ? 'failure' : 'success',
          outputs:
            id === 'scope'
              ? Object.fromEntries(categories.map((key) => [key, 'true']))
              : {},
        },
      ])
  );
  assert.equal(gate(completed, ctx).status, 1);
});

test('metadata-only runs cannot cancel validation or each other, including the admission callee', () => {
  const normal = context();
  const normalGroup = renderTemplate(workflow.concurrency.group, normal);
  assert.equal(
    normalGroup,
    `${workflow.name}-pr-42`,
    'a pull request shares one superseding group'
  );
  assert.equal(
    normalGroup,
    renderTemplate(
      workflow.concurrency.group,
      context('labeled', 'ready-for-ci', true, 2)
    )
  );
  const first = context('labeled', 'WIP', true, 3);
  const second = context('unlabeled', 'WIP', true, 4);
  // Label edits land in the same group, and cancel stays off so they cannot
  // replace an in-progress admitted run.
  assert.equal(renderTemplate(workflow.concurrency.group, first), normalGroup);
  assert.equal(renderTemplate(workflow.concurrency.group, second), normalGroup);
  assert.equal(
    evaluateExpression(workflow.concurrency['cancel-in-progress'], first),
    false
  );
  assert.equal(
    evaluateExpression(workflow.concurrency['cancel-in-progress'], second),
    false
  );
  assert.equal(
    normalGroup,
    renderTemplate(
      workflow.concurrency.group,
      context('synchronize', undefined, false)
    )
  );
  const callee = admission.concurrency;
  const calleeGroup = renderTemplate(callee.group, normal);
  const calleeFirst = renderTemplate(callee.group, first);
  assert.notEqual(calleeFirst, calleeGroup);
  assert.notEqual(calleeFirst, renderTemplate(callee.group, second));
  assert.equal(evaluateExpression(callee['cancel-in-progress'], first), false);
  assert.equal(evaluateExpression(callee['cancel-in-progress'], second), false);
  assert.notEqual(
    calleeGroup,
    renderTemplate(callee.group, context('synchronize', undefined, false))
  );
});

test('cancellation prevents the aggregate from allocating a runner', () => {
  assert.equal(workflow.jobs.gate.if, '!cancelled()');
});

test('metadata-only aggregates cannot replace the full-validation check name on the same head', () => {
  const normal = context();
  const canonical = renderTemplate(workflow.jobs.gate.name, normal);
  assert.equal(canonical, 'Cheap PR Checks');
  for (const action of ['labeled', 'unlabeled']) {
    for (const ready of [true, false]) {
      const labelOnly = context(action, 'security-review-required', ready, 2);
      assert.equal(labelOnly.github.sha, normal.github.sha);
      assert.equal(
        renderTemplate(workflow.jobs.gate.name, labelOnly),
        'Cheap PR Checks (label event)'
      );
      assert.notEqual(
        renderTemplate(workflow.jobs.gate.name, labelOnly),
        canonical
      );
    }
    assert.equal(
      renderTemplate(workflow.jobs.gate.name, context(action, 'ready-for-ci')),
      canonical
    );
  }
  for (const action of ['opened', 'reopened', 'ready_for_review'])
    assert.equal(
      renderTemplate(workflow.jobs.gate.name, context(action)),
      canonical
    );
});

test('stacked-base PRs defer mobile API mappings while main-base PRs select them', () => {
  const main = context();
  assert.equal(runnable('mobile', main), true);
  const stacked = context();
  stacked.github.base_ref = 'feature/parent';
  assert.equal(runnable('mobile', stacked), false);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const {
  context,
  pushesMain,
} = require('./protected-workflow-concurrency-helpers');

function assertMainIsolation(policy, name) {
  assert.ok(policy?.group, 'missing validation concurrency group');
  const github = { ...context('refs/heads/main'), workflow: name };
  const group = renderTemplate(policy.group, { github });
  for (const change of [{ sha: 'second' }, { run_id: 2 }, { run_attempt: 2 }]) {
    assert.notEqual(
      renderTemplate(policy.group, { github: { ...github, ...change } }),
      group,
      `main group must distinguish ${Object.keys(change)[0]}`
    );
  }
  for (const ref of ['refs/heads/main', 'refs/heads/production']) {
    assert.equal(
      evaluateExpression(policy['cancel-in-progress'] ?? false, {
        github: { ...github, ref },
      }),
      false,
      `push to ${ref} must never cancel an active run`
    );
  }
}

for (const [file, workflow] of Object.entries(readAllWorkflows())) {
  if (!pushesMain(workflow)) continue;
  test(`${file} preserves main validation attempts`, () => {
    if (file === 'release-sdk-dev.yaml') {
      // Publication holds the same FIFO lock from preparation through publish.
      assert.equal(workflow.concurrency.queue, 'max');
      assert.equal(workflow.concurrency['cancel-in-progress'], false);
      return;
    }
    const policies =
      file === 'oxc-check.yaml'
        ? ['check-ci', 'duplicate-validation', 'format', 'lint'].map(
            (job) => workflow.jobs[job].concurrency
          )
        : [workflow.concurrency];
    for (const policy of policies) assertMainIsolation(policy, workflow.name);
  });
}

test('a synthetic latest group loses pending main runs even with cancellation off', () => {
  const workflow = {
    name: 'Synthetic validation',
    on: { push: { branches: ['main'] } },
    concurrency: {
      group: 'synthetic-${{ github.ref }}-latest',
      'cancel-in-progress': false,
    },
  };
  assert.ok(pushesMain(workflow));
  assert.throws(
    () => assertMainIsolation(workflow.concurrency, workflow.name),
    /main group must distinguish sha/
  );
});

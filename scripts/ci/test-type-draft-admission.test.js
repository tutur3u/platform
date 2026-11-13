const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateExpression } = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

for (const file of ['turbo-unit-tests.yaml', 'type-check.yaml']) {
  const workflow = readWorkflow(file, { raw: true });
  test(`${file}: drafts cannot allocate any validation job`, () => {
    assert.ok(workflow.on.pull_request.types.includes('ready_for_review'));
    assert.ok(workflow.on.pull_request.types.includes('converted_to_draft'));
    for (const [id, job] of Object.entries(workflow.jobs)) {
      assert.match(job.if, /github\.event\.pull_request\.draft == false/, id);
      assert.equal(
        evaluateExpression(job.if, {
          github: {
            event_name: 'pull_request',
            event: {
              pull_request: {
                draft: true,
                labels: [{ name: 'ready-for-ci' }],
              },
            },
          },
        }),
        false,
        id
      );
    }
  });
  test(`${file}: readiness retains label admission and protected pushes`, () => {
    const job =
      workflow.jobs[file === 'type-check.yaml' ? 'type-check-pr' : 'changes'];
    const scope = (draft, labels) => ({
      github: {
        event_name: 'pull_request',
        event: {
          pull_request: { draft, labels: labels.map((name) => ({ name })) },
        },
      },
    });
    assert.equal(
      evaluateExpression(job.if, scope(false, ['ready-for-ci'])),
      true
    );
    assert.equal(evaluateExpression(job.if, scope(false, [])), false);
    const pushJob =
      workflow.jobs[file === 'type-check.yaml' ? 'type-check' : 'changes'];
    assert.equal(
      evaluateExpression(pushJob.if, {
        github: { event_name: 'push', event: {} },
      }),
      true
    );
    assert.deepEqual(workflow.on.push.branches, [
      'main',
      'production',
      'release-please--branches--**',
    ]);
    assert.equal(workflow.on.pull_request_target, undefined);
  });
}

test('privileged App admission and required security classification remain available', () => {
  const app = readWorkflow('auto-ready-for-ci.yaml', { raw: true });
  assert.ok(app.on.pull_request_target.types.includes('ready_for_review'));
  assert.match(
    app.jobs.label.if,
    /head.repo.id == github.event.pull_request.base.repo.id/
  );
  assert.match(app.jobs.label.if, /head.repo.full_name == github.repository/);
  assert.ok(
    app.jobs.label.steps.some((step) =>
      step.uses?.startsWith('actions/create-github-app-token@')
    )
  );
  assert.ok(
    !app.jobs.label.steps.some((step) =>
      step.uses?.startsWith('actions/checkout@')
    )
  );
  const classifier = readWorkflow('security-review-classifier.yaml', {
    raw: true,
  });
  assert.equal(classifier.jobs.classify.if, undefined);
  assert.ok(classifier.on.pull_request_target.types.includes('synchronize'));
  const checkout = classifier.jobs.classify.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(
    checkout.with.ref,
    '${{ github.event.repository.default_branch }}'
  );
});

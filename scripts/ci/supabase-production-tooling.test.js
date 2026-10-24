const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const expression = (body) => `\${{ ${body} }}`;

test('production prerequisite tooling comes from the workflow revision, not the migration target', () => {
  const workflow = readWorkflow('supabase-production.yaml');
  const evaluate = workflow.jobs['evaluate-prerequisites'];
  const checkouts = evaluate.steps.filter((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, expression('github.sha'));
  assert.equal(checkouts[0].with['persist-credentials'], false);
  assert.equal(checkouts[0].with['fetch-depth'], 0);
  const node = evaluate.steps.find((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  assert.equal(node.with['package-manager-cache'], false);
  const changed = evaluate.steps.find((step) => step.id === 'changed_files');
  assert.match(changed.run, /--head-sha "\$TARGET_SHA" --ref-name production/u);
  assert.equal(
    evaluate.outputs.target_sha,
    expression('steps.resolve_target.outputs.target_sha')
  );
  const deploy = workflow.jobs.deploy;
  const approved = deploy.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(
    approved.with.ref,
    expression('needs.evaluate-prerequisites.outputs.target_sha')
  );
  assert.equal(approved.with['persist-credentials'], false);
  assert.match(deploy.if, /outputs\.trusted_trigger == 'true'/u);
  assert.match(deploy.if, /outputs\.should_deploy == 'true'/u);
});

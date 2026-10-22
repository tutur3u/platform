const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const callers = [
  ['apps-cloudflare.yaml', 'native-publication-profiles'],
  ['calendar-cloudflare.yaml', 'native-profiles'],
  ['mail-cloudflare.yaml', 'native-profiles'],
];

function assertPermissions(workflow, qualificationId) {
  assert.notEqual(workflow.permissions?.deployments, 'write');
  const qualification = workflow.jobs[qualificationId];
  assert.equal(qualification.permissions.deployments, 'read');
  assert.equal(qualification.uses, './.github/workflows/wave1-native-app.yaml');
  const publication = workflow.jobs['native-publish-staging'];
  assert.equal(publication.permissions.deployments, 'write');
  assert.equal(publication.needs, qualificationId);
  assert.equal(
    publication.uses,
    './.github/workflows/wave1-native-publish.yaml'
  );
  assert.equal(publication.with.profile, 'staging');
  for (const ref of [
    'refs/heads/main',
    'refs/heads/production',
    'refs/pull/6399/merge',
  ]) {
    for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
      for (const allowed of ['true', 'false', '']) {
        const expression = publication.if.replace(
          /needs\.([\w-]+)/g,
          'needs["$1"]'
        );
        const actual = vm.runInNewContext(
          expression,
          {
            github: { ref, event_name: event },
            needs: {
              [qualificationId]: { outputs: { staging_allowed: allowed } },
            },
          },
          { timeout: 100 }
        );
        assert.equal(
          Boolean(actual),
          ref === 'refs/heads/main' &&
            event !== 'pull_request' &&
            allowed === 'true'
        );
      }
    }
  }
}

for (const [file, qualification] of callers) {
  test(`${file}: deployment writes are confined to admitted main publication`, () => {
    const workflow = readWorkflow(file);
    assertPermissions(workflow, qualification);
    for (const mutate of [
      (w) => {
        w.permissions.deployments = 'write';
      },
      (w) => {
        w.jobs[qualification].permissions.deployments = 'write';
      },
      (w) => {
        w.jobs['native-publish-staging'].if =
          "github.event_name == 'pull_request'";
      },
    ]) {
      const changed = structuredClone(workflow);
      mutate(changed);
      assert.throws(() => assertPermissions(changed, qualification));
    }
  });
}

test('read-only reusable qualification never requests nested publisher permissions', () => {
  const workflow = readWorkflow('wave1-native-app.yaml');
  assert.equal(workflow.permissions.deployments, 'read');
  assert.equal(
    workflow.on.workflow_call.outputs.staging_allowed.value,
    '$' + '{{ jobs.policy-staging.outputs.allowed }}'
  );
  for (const job of Object.values(workflow.jobs)) {
    assert.notEqual(job.permissions?.deployments, 'write');
    assert.notEqual(job.uses, './.github/workflows/wave1-native-publish.yaml');
  }
  assert.ok(workflow.jobs['policy-production']);
});

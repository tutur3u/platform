const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

test('previously conditional PR jobs retain their hosted Ubuntu route', () => {
  const workflows = readAllWorkflows();
  const jobs = {
    'ci-check.yml': ['check'],
    'docs-seo-check.yaml': ['validate'],
    'i18n-check.yaml': [
      'i18n-sort-check',
      'i18n-translation-check',
      'i18n-key-parity-check',
      'i18n-namespace-check',
    ],
    'mobile-api-mappings.yaml': ['verify'],
    'oxc-check.yaml': ['duplicate-validation', 'format', 'lint'],
    'turbo-unit-tests.yaml': ['test-shards-pr'],
    'type-check.yaml': ['type-check-pr'],
  };
  for (const [file, ids] of Object.entries(jobs)) {
    for (const id of ids) {
      assert.equal(
        workflows[file].jobs[id]['runs-on'],
        'ubuntu-latest',
        `${file}:${id}`
      );
    }
  }
  assert.equal(
    workflows['ci-check.yml'].on.workflow_call.inputs.pr_runner,
    undefined
  );
  assert.equal(
    workflows['oxc-check.yaml'].jobs['check-ci'].with.pr_runner,
    undefined
  );
});

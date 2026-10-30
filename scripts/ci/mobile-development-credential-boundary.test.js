const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('mobile-build-android.yaml', { raw: true });

function assertNoCredentials(value) {
  assert.doesNotMatch(JSON.stringify(value), /secrets\./u);
}

test('development Android PR workflow receives no repository secrets', () => {
  assert.ok(workflow.on.pull_request);
  assertNoCredentials(workflow);
});

test('credential guard rejects the former Firebase config injection', () => {
  const injected = structuredClone(workflow);
  injected.jobs['build-android'].steps.push({
    env: {
      FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON:
        '$' + '{{ secrets.FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON }}',
    },
  });
  assert.throws(() => assertNoCredentials(injected), assert.AssertionError);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('mobile-build-android.yaml', { raw: true });

function assertNoCredentials(value) {
  if (typeof value === 'string') {
    assert.doesNotMatch(value, /\bsecrets\s*(?:\.|\[)/iu);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assert.notEqual(key.toLowerCase(), 'secrets');
      assertNoCredentials(item);
    }
  }
}

test('development Android PR workflow receives no repository secrets', () => {
  assert.ok(workflow.on.pull_request);
  assertNoCredentials(workflow);
});

for (const reference of [
  'secrets.FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON',
  "secrets['FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON']",
  "SeCrEtS [ 'FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON' ]",
]) {
  test(`credential guard rejects ${reference}`, () => {
    const injected = structuredClone(workflow);
    injected.jobs['build-android'].steps.push({
      env: { FIREBASE_CONFIG: `\${{ ${reference} }}` },
    });
    assert.throws(() => assertNoCredentials(injected), assert.AssertionError);
  });
}

test('credential guard rejects reusable workflow secret inheritance', () => {
  const injected = structuredClone(workflow);
  injected.jobs['build-android'].secrets = 'inherit';
  assert.throws(() => assertNoCredentials(injected), assert.AssertionError);
});

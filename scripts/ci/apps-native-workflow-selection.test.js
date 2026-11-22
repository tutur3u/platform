const fs = require('node:fs');
const test = require('node:test');
const {
  assertWorkflowDecision,
  createFixtureRoot,
} = require('./workflow-config-test-helpers.js');

test('Apps selects native artifact inputs and skips test-only edits', (t) => {
  const rootDir = createFixtureRoot();
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const changedFiles = ['scripts/ci/apps-native-artifact.py'];
  for (const workflowName of [
    'apps-cloudflare.yaml',
    'calendar-cloudflare.yaml',
    'mail-cloudflare.yaml',
  ]) {
    assertWorkflowDecision(
      { changedFiles, rootDir, workflowName },
      workflowName === 'apps-cloudflare.yaml'
    );
  }

  for (const [filePath, shouldRun] of [
    ['scripts/ci/apps-native-browser-fence.runtime.mjs', true],
    ['scripts/ci/apps-native-browser.runtime.mjs', true],
    ['scripts/ci/apps-native-runtime-launcher.mjs', true],
    ['scripts/ci/apps-native-runtime-plan.mjs', true],
    ['scripts/ci/apps-native-runtime-pointer.mjs', true],
    ['scripts/ci/apps-native-runtime.mjs', true],
    ['scripts/ci/apps-native-production-mount.mjs', true],
    ['scripts/ci/wave1-native-profile.mjs', true],
    ['scripts/ci/apps-native-artifact.test.py', false],
    ['scripts/ci/apps-native-runtime.test.mjs', false],
    ['scripts/ci/apps-native-runtime-hidden.test.mjs', false],
  ]) {
    assertWorkflowDecision(
      {
        changedFiles: [filePath],
        rootDir,
        workflowName: 'apps-cloudflare.yaml',
      },
      shouldRun
    );
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { getWorkflowDecision } = require('../../tuturuuu.ts');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const platforms = ['android', 'ios', 'macos', 'linux', 'windows'];
const decision = (platform, files, eventName = 'pull_request', ciConfig) =>
  getWorkflowDecision({
    changedFiles: files,
    eventName,
    workflowName: `mobile-build-${platform}.yaml`,
    ciConfig,
  }).shouldRun;

test('portable mobile PR changes retain Android and omit four platform builds', () => {
  for (const file of [
    'lib/main.dart',
    'test/main_test.dart',
    'assets/logo.png',
  ]) {
    for (const platform of platforms) {
      assert.equal(
        decision(platform, [`apps/mobile/${file}`]),
        platform === 'android'
      );
    }
  }
});

test('native PR edits retain their platform build and Android smoke', () => {
  for (const changed of platforms) {
    for (const platform of platforms) {
      assert.equal(
        decision(platform, [`apps/mobile/${changed}/native.conf`]),
        platform === 'android' || platform === changed
      );
    }
  }
  assert.equal(
    decision('ios', ['apps/mobile/lib/foo.dart', 'apps/mobile/ios/Podfile']),
    true
  );
});

test('unknown, dependency, workflow and shared build inputs fail open', () => {
  for (const files of [
    null,
    [],
    ['apps/mobile/pubspec.lock'],
    ['apps/mobile/pubspec.yaml'],
    ['apps/mobile/l10n.yaml'],
    ['apps/mobile/new-platform/config'],
    ['scripts/ci/mobile-build-selection.ts'],
    ['.github/actions/setup-flutter-with-cache/action.yml'],
    ['.github/workflows/mobile-build-ios.yaml'],
  ]) {
    for (const platform of platforms)
      assert.equal(decision(platform, files), true);
  }
});

test('main, production, manual and rerun-compatible event selection retain full builds', () => {
  for (const event of [
    'push',
    'workflow_dispatch',
    'workflow_call',
    undefined,
  ]) {
    for (const platform of platforms) {
      assert.equal(
        decision(platform, ['apps/mobile/lib/main.dart'], event || 'unknown'),
        true
      );
    }
  }
});

test('explicit switchboard disable remains authoritative', () => {
  assert.equal(
    decision('ios', ['apps/mobile/ios/Podfile'], 'pull_request', {
      'mobile-build-ios.yaml': false,
    }),
    false
  );
});

test('mobile PR checks remain; expensive desktop and Apple builds use nightly/release/manual', () => {
  for (const platform of platforms) {
    const workflow = readWorkflow(`mobile-build-${platform}.yaml`);
    assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
    if (['ios', 'macos', 'windows'].includes(platform)) {
      assert.equal(workflow.on.push, undefined);
      assert.equal(workflow.on.schedule.length, 1);
      assert.deepEqual(workflow.on.release.types, ['published']);
      assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    } else {
      assert.deepEqual(workflow.on.push.branches, ['main']);
    }
    assert.ok(workflow.on.pull_request.types.includes('ready_for_review'));
    assert.ok(workflow.on.pull_request.types.includes('converted_to_draft'));
    assert.equal(
      workflow.jobs[`build-${platform}`].if,
      "needs.check-ci.outputs.should_run == 'true'"
    );
  }
  const checkout = readWorkflow('ci-check.yml').jobs.check.steps.find((s) =>
    s.uses?.startsWith('actions/checkout@')
  );
  assert.ok(
    checkout.with['sparse-checkout'].includes(
      'scripts/ci/mobile-build-selection.ts'
    )
  );
});

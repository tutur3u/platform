const assert = require('node:assert/strict');
const test = require('node:test');
const releaseConfig = require('../../release-please-config.json');
const { evaluateExpression } = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const platforms = ['windows', 'macos', 'ios'];
const prefix = `${releaseConfig.packages['apps/mobile'].component}${releaseConfig['tag-separator']}v`;

function context(eventName, tag, pullRequest) {
  return {
    github: {
      event_name: eventName,
      event: {
        release: tag === undefined ? undefined : { tag_name: tag },
        pull_request: pullRequest,
      },
    },
  };
}

for (const platform of platforms) {
  const workflow = readWorkflow(`mobile-build-${platform}.yaml`, {
    raw: true,
  });
  const gate = workflow.jobs['check-ci'].if;

  test(`${platform}: package releases cannot allocate the mobile preflight`, () => {
    for (const tag of [
      'realtime-v0.11.0',
      'payment-core-v0.6.2',
      'teach-v0.29.0',
      'desktop-v0.27.0',
      'not-mobile-v0.27.0',
      '',
      undefined,
    ]) {
      assert.equal(
        evaluateExpression(gate, context('release', tag)),
        false,
        String(tag)
      );
    }
  });

  test(`${platform}: mobile releases, nightly and manual builds remain eligible`, () => {
    assert.equal(prefix, 'mobile-v');
    assert.equal(releaseConfig['include-component-in-tag'], true);
    assert.equal(releaseConfig['include-v-in-tag'], true);
    for (const tag of [`${prefix}0.27.0`, `${prefix}0.28.0-beta.1`]) {
      assert.equal(evaluateExpression(gate, context('release', tag)), true);
    }
    for (const event of ['schedule', 'workflow_dispatch']) {
      assert.equal(evaluateExpression(gate, context(event)), true);
      assert.ok(Object.hasOwn(workflow.on, event));
    }
    assert.deepEqual(workflow.on.release.types, ['published']);
  });

  test(`${platform}: existing PR admission and dependent-build gates remain`, () => {
    for (const [draft, labels, expected] of [
      [false, [], false],
      [true, [{ name: 'ready-for-ci' }], false],
      [false, [{ name: 'ready-for-ci' }], true],
    ]) {
      assert.equal(
        evaluateExpression(
          gate,
          context('pull_request', undefined, { draft, labels })
        ),
        expected
      );
    }
    const build = workflow.jobs[`build-${platform}`];
    assert.deepEqual(build.needs, ['check-ci']);
    for (const shouldRun of ['true', 'false', undefined]) {
      assert.equal(
        evaluateExpression(build.if, {
          ...context('release', `${prefix}0.27.0`),
          needs: { 'check-ci': { outputs: { should_run: shouldRun } } },
        }),
        shouldRun === 'true'
      );
    }
  });
}

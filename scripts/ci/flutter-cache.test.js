const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper.js');
const {
  assertWorkflowDecision,
  createFixtureRoot,
} = require('./workflow-config-test-helpers.js');
const actionFile = '.github/actions/setup-flutter-with-cache/action.yml';
const action = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
      actionFile,
    ],
    { encoding: 'utf8' }
  )
);
const trusted =
  "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')";
const ghaExpression = (body) => `\${{ ${body} }}`;
const cacheSha = '55cc8345863c7cc4c66a329aec7e433d2d1c52a9';
const flutterSha = '1a449444c387b1966244ae4d4f8c696479add0b2';

test('only main push/dispatch attaches cache post-job saves; every other ref restores only', () => {
  const cacheSteps = action.runs.steps.filter((step) =>
    step.uses.startsWith('actions/cache')
  );
  assert.equal(cacheSteps.length, 4);
  for (const kind of ['SDK', 'pub']) {
    const steps = cacheSteps.filter((step) => step.name.includes(kind));
    assert.equal(steps.length, 2);
    const save = steps.find(
      (step) => step.uses === `actions/cache@${cacheSha}`
    );
    const restore = steps.find(
      (step) => step.uses === `actions/cache/restore@${cacheSha}`
    );
    assert.equal(save.if, trusted);
    assert.equal(restore.if, `!(${trusted})`);
    assert.deepEqual(save.with, restore.with);
    assert.equal(save.with['restore-keys'], undefined);
    // Evaluate the actual guard for the event/ref combinations that used to save duplicates.
    for (const ref of [
      'refs/heads/main',
      'refs/heads/feature/a',
      'refs/pull/1/merge',
      'refs/heads/production',
    ])
      for (const event of [
        'push',
        'workflow_dispatch',
        'pull_request',
        'pull_request_target',
        'workflow_run',
      ]) {
        const evaluate = (expression) =>
          Function(
            'github',
            `return ${expression}`
          )({ ref, event_name: event });
        const expected =
          ref === 'refs/heads/main' &&
          ['push', 'workflow_dispatch'].includes(event);
        assert.equal(evaluate(save.if), expected);
        assert.equal(evaluate(restore.if), !expected);
      }
  }
});

test('SDK and pub download identities ignore lockfile churn and upstream saving is off', () => {
  const identity = action.runs.steps[0];
  assert.equal(identity.id, 'identity');
  assert.equal(identity.with['dry-run'], true);
  assert.equal(identity.with['cache-key'], undefined);
  for (const step of action.runs.steps) {
    if (step.uses.startsWith('subosito/')) {
      assert.equal(step.uses, `subosito/flutter-action@${flutterSha}`);
      assert.equal(step.with.cache, false);
      assert.equal(step.with['pub-cache'], false);
    }
    if (step.name.includes('SDK'))
      assert.doesNotMatch(step.with.key, /pubspec|hashFiles/);
    if (step.name.includes('pub'))
      assert.equal(
        step.with.key,
        `flutter-pub-v2-${ghaExpression('runner.os')}-${ghaExpression('runner.arch')}-${ghaExpression('steps.identity.outputs.CHANNEL')}-${ghaExpression('steps.identity.outputs.VERSION')}`
      );
  }
  const install = action.runs.steps.at(-1);
  const expression = (field) =>
    `${String.fromCharCode(36)}{{ steps.identity.outputs.${field} }}`;
  for (const [input, output] of [
    ['flutter-version', 'VERSION'],
    ['channel', 'CHANNEL'],
    ['architecture', 'ARCHITECTURE'],
    ['cache-path', 'CACHE-PATH'],
    ['pub-cache-path', 'PUB-CACHE-PATH'],
  ])
    assert.equal(install.with[input], expression(output));
  assert.match(
    fs.readFileSync(actionFile, 'utf8'),
    new RegExp(`${flutterSha} # v2`)
  );
  assert.match(
    fs.readFileSync(actionFile, 'utf8'),
    new RegExp(`${cacheSha} # v6`)
  );
});

test('all caching mobile jobs use the wrapper, retain version pins and trigger on wrapper edits', () => {
  const workflows = readAllWorkflows();
  let adopted = 0;
  for (const [name, workflow] of Object.entries(workflows)) {
    if (!name.startsWith('mobile')) continue;
    let usesWrapper = false;
    for (const job of Object.values(workflow.jobs))
      for (const step of job.steps || []) {
        if (step.uses?.startsWith('subosito/flutter-action')) {
          assert.equal(step.with.cache, false);
          assert.equal(step.with['pub-cache'], false);
        }
        if (step.uses === './.github/actions/setup-flutter-with-cache') {
          usesWrapper = true;
          adopted++;
          assert.deepEqual(step.with, {
            'flutter-version': '3.47.x',
            channel: 'stable',
          });
        }
      }
    if (usesWrapper) {
      for (const event of Object.values(workflow.on))
        if (event?.paths)
          assert.ok(
            event.paths.includes('.github/actions/setup-flutter-with-cache/**')
          );
      assertWorkflowDecision(
        {
          changedFiles: [actionFile],
          rootDir: createFixtureRoot(),
          workflowName: name,
        },
        true
      );
    }
  }
  assert.equal(adopted, 9);
});

test('desktop, release and employee jobs restore through the wrapper even when saving is disabled', () => {
  const workflows = readAllWorkflows();
  const expected = {
    'desktop-beta.yaml': 2,
    'desktop-store-draft.yaml': 1,
    'release-please-auto-merge.yaml': 1,
    'employee-schema-contract.yaml': 1,
  };
  for (const [file, count] of Object.entries(expected)) {
    const steps = Object.values(workflows[file].jobs).flatMap(
      (job) => job.steps || []
    );
    assert.equal(
      steps.filter(
        (step) => step.uses === './.github/actions/setup-flutter-with-cache'
      ).length,
      count,
      file
    );
    assert.equal(
      steps.some((step) => step.uses?.startsWith('subosito/flutter-action@')),
      false,
      file
    );
  }
  for (const event of ['push', 'pull_request'])
    assert.ok(
      workflows['desktop-beta.yaml'].on[event].paths.includes(
        '.github/actions/setup-flutter-with-cache/**'
      )
    );
});

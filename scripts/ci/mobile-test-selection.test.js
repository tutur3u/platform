const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { getMobileTestsAffected } = require('./mobile-build-selection.ts');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const { evaluateExpression } = require('./github-expression-test-helper');

const root = path.resolve(__dirname, '../..');
const manifests = ['apps/web', 'apps/mastermind', 'packages/ui'].map(
  (entry) => ({ name: entry, path: entry, dependencies: [] })
);
const selected = (
  files,
  eventName = 'pull_request',
  workspaceManifests = manifests
) =>
  getMobileTestsAffected({ changedFiles: files, eventName, workspaceManifests })
    .tests;

test('unrelated Node/Bun PR inputs omit only Flutter shards', () => {
  for (const files of [
    ['bun.lock'],
    ['bun.lock', 'package.json', 'apps/mastermind/src/native/auth.ts'],
    ['bun.lock', 'packages/ui/package.json', 'README.md'],
    ['.\\bun.lock', 'apps\\web\\package.json'],
  ])
    assert.equal(selected(files), false);
});

test('mobile security, dependency, realtime and unknown inputs retain tests', () => {
  for (const file of [
    'apps/mobile/test/features/auth/view/login_email_mode_captcha_test.dart',
    'apps/mobile/lib/features/auth/login.dart',
    'apps/mobile/pubspec.lock',
    'apps/mobile/vendor/record_ios/pubspec.yaml',
    'apps/meet-realtime/src/index.ts',
    'packages/realtime/src/protocol.ts',
    'packages/ui/embedded/pubspec.yaml',
    'apps/web/embedded/library.dart',
    'apps/unknown/package.json',
    '.github/workflows/mobile.yaml',
    '.github/actions/setup-flutter-with-cache/action.yml',
    'scripts/check-mobile-lucide-sync.js',
    'config/feature-flags.json',
    'turbo.json',
    'apps/web/../mobile/pubspec.yaml',
    '',
  ])
    assert.equal(selected(['bun.lock', file]), true, file);
  for (const files of [null, [], ['apps/web/package.json']])
    assert.equal(selected(files), true);
  assert.equal(
    selected(['bun.lock', 'apps/web/package.json'], 'pull_request', []),
    true
  );
});

test('main, scheduled, manual and unknown events retain all four shards', () => {
  for (const event of [
    'push',
    'schedule',
    'workflow_dispatch',
    'workflow_call',
    'unknown',
  ])
    assert.equal(selected(['bun.lock'], event), true, event);
});

test('Dart path dependencies stay inside the mobile input boundary', () => {
  const pubspec = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        path.join(root, 'apps/mobile/pubspec.yaml'),
      ],
      { encoding: 'utf8' }
    )
  );
  for (const section of [
    'dependencies',
    'dev_dependencies',
    'dependency_overrides',
  ]) {
    for (const [name, value] of Object.entries(pubspec[section] || {})) {
      if (!value || typeof value !== 'object' || !value.path) continue;
      const relative = path.relative(
        path.join(root, 'apps/mobile'),
        path.resolve(root, 'apps/mobile', value.path)
      );
      assert.ok(
        !relative.startsWith('..') && !path.isAbsolute(relative),
        `Extend the mobile test input boundary for Dart dependency ${name}: ${value.path}`
      );
    }
  }
});

test('real switchboard emits the mobile job decision without disabling the workflow', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-test-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'output');
  execFileSync(
    'bun',
    [
      'scripts/ci/check-workflow-config.ts',
      '--workflow',
      'mobile.yaml',
      '--event-name',
      'pull_request',
      '--root-dir',
      root,
      '--changed-files',
      'bun.lock\napps/web/package.json',
    ],
    {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: output },
      encoding: 'utf8',
    }
  );
  const values = Object.fromEntries(
    fs
      .readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  );
  assert.equal(values.should_run, 'true');
  assert.deepEqual(JSON.parse(values.affected_jobs), { tests: false });
});

test('workflow omission requires literal false and reruns always execute', () => {
  const workflow = readWorkflow('mobile.yaml');
  assert.deepEqual(workflow.jobs.tests.strategy.matrix.shard, [0, 1, 2, 3]);
  for (const decision of [undefined, true, null, 'false', false]) {
    for (const attempt of [1, 2]) {
      const context = {
        github: {
          event_name: 'pull_request',
          run_attempt: attempt,
          event: { pull_request: { draft: false } },
        },
        needs: {
          'check-ci': {
            outputs: {
              should_run: 'true',
              affected_jobs: JSON.stringify(
                decision === undefined ? {} : { tests: decision }
              ),
            },
          },
        },
      };
      assert.equal(
        evaluateExpression(workflow.jobs.tests.if, context),
        decision !== false || attempt > 1
      );
    }
  }
  for (const id of ['quality', 'realtime-parity'])
    assert.ok(!workflow.jobs[id].if.includes('affected_jobs'));
});

test('mobile aggregate accepts only qualified omission and rejects all failed gates', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-test-aggregate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const guard = readWorkflow('mobile.yaml').jobs.build.steps[0];
  const base = {
    ...process.env,
    QUALITY_RESULT: 'success',
    REALTIME_RESULT: 'success',
    TEST_RESULT: 'success',
    TEST_REQUIRED: 'true',
    GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
  };
  const run = (changes = {}) =>
    spawnSync('bash', ['-e', '-c', guard.run], {
      env: { ...base, ...changes },
      encoding: 'utf8',
    }).status;
  assert.equal(run(), 0);
  assert.equal(run({ TEST_REQUIRED: 'false', TEST_RESULT: 'skipped' }), 0);
  assert.match(
    fs.readFileSync(base.GITHUB_STEP_SUMMARY, 'utf8'),
    /no Flutter test execution is claimed/
  );
  for (const result of ['failure', 'cancelled', 'skipped', '']) {
    assert.notEqual(run({ TEST_RESULT: result }), 0, result);
    for (const field of ['QUALITY_RESULT', 'REALTIME_RESULT'])
      assert.notEqual(
        run({
          [field]: result,
          TEST_REQUIRED: 'false',
          TEST_RESULT: 'skipped',
        }),
        0
      );
  }
  for (const result of ['failure', 'cancelled', ''])
    assert.notEqual(run({ TEST_REQUIRED: 'false', TEST_RESULT: result }), 0);
});

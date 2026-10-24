const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const producer = readWorkflow('turbo-unit-tests.yaml');
const consumer = readWorkflow('codecov.yaml');
const enabled = () => ({
  result: 'success',
  outputs: { should_run: 'true', run_checks: 'true' },
});
function admitted(job, needs, cancelled = false) {
  const code = job.if
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/needs\.([a-z-]+)/g, (_, id) => `needs['${id}']`);
  return Function(
    'needs',
    'cancelled',
    `return (${code});`
  )(needs, () => cancelled);
}
function gate(job, env) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', job.steps[0].run], {
    env: { ...process.env, ...env },
  }).status;
}

test('one coverage-enabled shard command owns both signals without retry', () => {
  const commands = [
    ...Object.values(producer.jobs),
    ...Object.values(consumer.jobs),
  ]
    .flatMap((job) => job.steps || [])
    .map((step) => step.with?.command || step.run || '')
    .filter((command) => command.includes('run-test-shard.js'));
  assert.equal(commands.length, 1);
  assert.match(
    commands[0],
    /^node scripts\/ci\/run-test-shard\.js .* 4 --coverage$/
  );
  const shards = producer.jobs['test-shards'];
  assert.equal(shards['timeout-minutes'], 20);
  assert.equal(shards.strategy['fail-fast'], false);
  assert.deepEqual(shards.strategy.matrix.shard, [0, 1, 2, 3]);
  assert.deepEqual(Object.keys(shards.env).sort(), [
    'NEXT_PUBLIC_PROXY_API_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PROXY_API_KEY',
    'SUPABASE_SECRET_KEY',
  ]);
  assert.ok(shards.steps.every((step) => !step.env?.CI_RETRY_MAX_ATTEMPTS));
  assert.equal(producer.jobs['duplicate-validation'], undefined);
  assert.equal(consumer.jobs['test-shards'], undefined);
});

test('both switchboard entries independently admit the shared execution', () => {
  for (const [unit, coverage] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    const needs = { 'check-ci': enabled(), 'coverage-check-ci': enabled() };
    needs['check-ci'].outputs.should_run = String(unit);
    needs['coverage-check-ci'].outputs.should_run = String(coverage);
    assert.equal(
      admitted(producer.jobs['test-shards'], needs),
      unit || coverage
    );
    assert.equal(admitted(producer.jobs['test-shards'], needs, true), false);
    for (const id of ['check-ci', 'coverage-check-ci']) {
      const failed = { 'check-ci': enabled(), 'coverage-check-ci': enabled() };
      failed[id].result = 'failure';
      failed[
        id === 'check-ci' ? 'coverage-check-ci' : 'check-ci'
      ].outputs.run_checks = 'false';
      assert.equal(admitted(producer.jobs['test-shards'], failed), false);
    }
  }
  assert.equal(
    producer.jobs['check-ci'].with.workflow_name,
    'turbo-unit-tests.yaml'
  );
  assert.equal(
    producer.jobs['coverage-check-ci'].with.workflow_name,
    'codecov.yaml'
  );
});

test('original check names fail closed on red, cancelled, missing or skipped results', () => {
  assert.equal(producer.name, 'Test');
  assert.equal(producer.jobs.build.name, 'Unit Tests (24)');
  assert.match(producer.jobs['test-shards'].name, /^Unit test shard/);
  assert.match(producer.jobs['coverage-shards'].name, /^Coverage shard/);
  assert.deepEqual(
    producer.jobs['coverage-shards'].strategy.matrix.shard,
    [0, 1, 2, 3]
  );
  assert.equal(
    producer.jobs['coverage-result'].name,
    'Run tests and collect coverage'
  );
  const jobs = [
    [
      producer.jobs.build,
      {
        TEST_RESULT: 'success',
        ROOT_SCRIPT_RESULT: 'success',
        RUST_QUALIFICATION_REQUIRED: 'false',
      },
    ],
    [
      producer.jobs['coverage-result'],
      {
        TEST_RESULT: 'success',
        UPLOAD_RESULT: 'success',
        COVERAGE_RESULT: 'success',
      },
    ],
    [producer.jobs['coverage-shards'], { TEST_RESULT: 'success' }],
  ];
  for (const [job, env] of jobs) {
    assert.equal(gate(job, env), 0);
    for (const key of Object.keys(env).filter((key) =>
      key.endsWith('_RESULT')
    )) {
      for (const state of ['failure', 'cancelled', 'skipped', '']) {
        assert.notEqual(gate(job, { ...env, [key]: state }), 0);
      }
    }
  }
  for (const state of ['failure', 'cancelled', 'skipped']) {
    const needs = {
      'coverage-check-ci': enabled(),
      'test-shards': { result: state },
    };
    assert.equal(admitted(producer.jobs['coverage-result'], needs), true);
    assert.equal(admitted(producer.jobs['coverage-upload'], needs), false);
  }
});

test('coverage artifacts stay in the same run and consumer cannot execute tests', () => {
  assert.deepEqual(Object.keys(consumer.on), ['workflow_call']);
  assert.equal(
    consumer.concurrency,
    undefined,
    'caller owns cancellation, avoiding a colliding lock'
  );
  const call = producer.jobs['coverage-upload'];
  assert.equal(call.uses, './.github/workflows/codecov.yaml');
  assert.ok(call.needs.includes('test-shards'));
  assert.deepEqual(Object.keys(call.secrets), ['CODECOV_TOKEN']);
  const upload = producer.jobs['test-shards'].steps.find((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  );
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.match(upload.with.name, /^coverage-shard-/);
  const download = consumer.jobs.test.steps.find((step) =>
    step.uses?.startsWith('actions/download-artifact@')
  );
  assert.equal(download.with.pattern, 'coverage-shard-*');
  assert.equal(download.with['merge-multiple'], true);
  assert.equal(download.with['run-id'], undefined);
  assert.ok(
    consumer.jobs.test.steps.some((step) =>
      step.uses?.startsWith('codecov/codecov-action@')
    )
  );
  assert.ok(
    consumer.jobs.test.steps.every((step) => !step.run && !step.with?.command)
  );
});

test('shared preflight retains release relevance, least privilege and release-only skips', () => {
  assert.deepEqual(producer.permissions, { contents: 'read' });
  for (const [id, name] of [
    ['check-ci', 'turbo-unit-tests.yaml'],
    ['coverage-check-ci', 'codecov.yaml'],
  ]) {
    const job = producer.jobs[id];
    assert.equal(job.uses, './.github/workflows/ci-check.yml');
    assert.deepEqual(job.with, {
      workflow_name: name,
      check_release_only: true,
    });
    assert.deepEqual(job.permissions, {
      contents: 'read',
      deployments: 'read',
    });
  }
  for (const output of ['should_run', 'run_checks']) {
    const needs = {
      'check-ci': enabled(),
      'coverage-check-ci': enabled(),
      'test-shards': { result: 'success' },
    };
    needs['check-ci'].outputs[output] = 'false';
    needs['coverage-check-ci'].outputs[output] = 'false';
    for (const id of [
      'test-shards',
      'build',
      'coverage-shards',
      'coverage-upload',
      'coverage-result',
    ]) {
      assert.equal(
        admitted(producer.jobs[id], needs),
        false,
        `${id}/${output}`
      );
    }
  }
  assert.ok(producer.jobs.build.needs.includes('root-script-tests'));
  assert.ok(producer.jobs.build.needs.includes('backend-source-qualification'));
});

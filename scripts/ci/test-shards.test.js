const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { runWorkflowGate } = require('./workflow-gate-test-helper');
const {
  commandForShard,
  discoverPackages,
  planShards,
} = require('./test-shards.js');

const root = path.resolve(__dirname, '../..');
const readWorkflow = (name) =>
  JSON.parse(
    execFileSync(
      'ruby',
      [
        '-e',
        "require 'yaml';require 'json';puts JSON.generate(YAML.load_file(ARGV[0]))",
        path.join(root, '.github/workflows', name),
      ],
      { encoding: 'utf8' }
    )
  );

test('every enabled workspace runs exactly once, with identical unit and coverage partitioning', () => {
  const packages = discoverPackages(root);
  const plan = planShards(packages, 4);
  const assigned = plan.flatMap((shard) => shard.packages);
  assert.equal(new Set(assigned).size, packages.length);
  assert.deepEqual(
    [...assigned].sort(),
    packages.map((pkg) => pkg.name).sort()
  );
  assert.ok(!assigned.includes('@tuturuuu/tanstack-web'));
  assert.deepEqual(planShards([...packages].reverse(), 4), plan);
  for (let index = 0; index < 4; index++) {
    const unit = commandForShard(plan, index);
    assert.deepEqual(commandForShard(plan, index, true), [
      ...unit,
      '--coverage',
    ]);
    assert.ok(unit.includes('--maxWorkers=2'));
    assert.ok(unit.includes('--concurrency=2'));
    assert.ok(!unit.includes('--passWithNoTests'));
  }
});

test('new suites join automatically and generated/dependency files do not inflate weights', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'test-shards-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'packages'));
  const directory = path.join(fixture, 'apps', 'new-app');
  fs.mkdirSync(path.join(directory, 'node_modules'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: '@test/new-app', scripts: { test: 'vitest run' } })
  );
  fs.writeFileSync(path.join(directory, 'new.test.ts'), '');
  fs.writeFileSync(path.join(directory, 'node_modules', 'vendor.test.ts'), '');
  assert.deepEqual(discoverPackages(fixture), [
    { name: '@test/new-app', weight: 1 },
  ]);
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'invalid; command',
      scripts: { test: 'vitest run' },
    })
  );
  assert.throws(() => discoverPackages(fixture), /Invalid test workspace/);
});

test('largest suites start in separate shards and invalid or empty shards fail', () => {
  const packages = [10, 20, 30, 40].map((weight) => ({
    name: `pkg-${weight}`,
    weight,
  }));
  assert.deepEqual(
    planShards(packages, 2).map((shard) => shard.weight),
    [50, 50]
  );
  for (const invalid of [0, -1, 1.5, 5, NaN])
    assert.throws(() => planShards(packages, invalid));
  assert.throws(() => commandForShard(planShards(packages, 2), 2));
  assert.throws(() => commandForShard([{ packages: [] }], 0));
});

test('all matrix failures propagate through stable required check names', () => {
  for (const [file, gate, workers, expectedName] of [
    ['mobile.yaml', 'build', 'tests', 'build'],
    ['turbo-unit-tests.yaml', 'build', 'test-shards', 'Unit Tests (24)'],
  ]) {
    const workflow = readWorkflow(file);
    const job = workflow.jobs[gate];
    assert.equal(job.name, expectedName);
    assert.ok(job.needs.includes(workers));
    assert.match(
      job.if,
      file === 'mobile.yaml' ? /always\(\)/ : /!cancelled\(\)/
    );
    assert.equal(workflow.jobs[workers].strategy['fail-fast'], false);
    assert.deepEqual(
      workflow.jobs[workers].strategy.matrix.shard,
      [0, 1, 2, 3]
    );
    const check = job.steps.find(
      (step) =>
        step.env?.TEST_RESULT && !step.name.startsWith('Documentation-only')
    );
    assert.match(
      check.env.TEST_RESULT,
      new RegExp(`needs\\.${workers}\\.result`)
    );
    // Run Actions' fail-fast shell with every unrelated prerequisite satisfied.
    const successful = {
      CHANGES_RESULT: 'success',
      CODE: 'true',
      RUST_QUALIFICATION_REQUIRED: 'false',
      TEST_RESULT: 'success',
      QUALITY_RESULT: 'success',
      REALTIME_RESULT: 'success',
      ROOT_SCRIPT_RESULT: 'success',
      DUPLICATE_RESULT: 'skipped',
      DUPLICATE_RUN_CHECKS: '',
    };
    const required = [
      'TEST_RESULT',
      ...(file === 'mobile.yaml' ? ['QUALITY_RESULT', 'REALTIME_RESULT'] : []),
      ...(file === 'turbo-unit-tests.yaml' ? ['ROOT_SCRIPT_RESULT'] : []),
    ];
    if (file === 'mobile.yaml') {
      assert.ok(job.needs.includes('realtime-parity'));
      assert.match(check.env.REALTIME_RESULT, /needs\.realtime-parity\.result/);
    }
    if (file === 'turbo-unit-tests.yaml') {
      assert.ok(job.needs.includes('root-script-tests'));
      assert.match(
        job.steps.find((step) => step.env?.ROOT_SCRIPT_RESULT).env
          .ROOT_SCRIPT_RESULT,
        /needs\.root-script-tests\.result/
      );
    }
    for (const dependency of required) {
      for (const state of ['failure', 'cancelled', 'skipped', '']) {
        assert.notEqual(
          runWorkflowGate(job, { ...successful, [dependency]: state }).status,
          0
        );
      }
    }
    assert.equal(runWorkflowGate(job, successful).status, 0);
    assert.match(
      workflow.concurrency['cancel-in-progress'],
      /github\.event_name == 'push'/
    );
  }
});

test('coverage is uploaded only after all complete workspace artifacts are collected', () => {
  const workflow = readWorkflow('turbo-unit-tests.yaml');
  const producer = workflow.jobs['test-shards'].steps.find((step) =>
    step.uses?.startsWith('actions/upload-artifact')
  );
  assert.equal(producer.with['if-no-files-found'], 'error');
  assert.match(producer.with.path, /apps\/\*\/coverage/);
  assert.match(producer.with.path, /packages\/\*\/coverage/);
  const steps = readWorkflow('codecov.yaml').jobs.test.steps;
  const download = steps.findIndex((step) =>
    step.uses?.startsWith('actions/download-artifact')
  );
  const upload = steps.findIndex((step) => step.uses?.startsWith('codecov/'));
  assert.ok(download >= 0 && upload > download);
  assert.equal(steps[download].with['merge-multiple'], true);
  assert.equal(steps[download].with.pattern, 'coverage-shard-*');
});

test('affected planner retains package tests, leaf scope and fail-safe inputs', () => {
  const { affectedShards } = require('./test-shards');
  const all = planShards(discoverPackages(root), 4);
  for (const raw of [
    undefined,
    '{',
    '{}',
    '{"mode":"affected"}',
    '{"mode":"affected","workspaces":["../bad"]}',
  ])
    assert.deepEqual(affectedShards(root, 4, raw), all);
  for (const directory of ['apps/web', 'packages/utils']) {
    const name = JSON.parse(
      fs.readFileSync(path.join(root, directory, 'package.json'))
    ).name;
    const selected = affectedShards(
      root,
      4,
      JSON.stringify({ mode: 'affected', workspaces: [directory] })
    );
    assert.deepEqual(
      selected.flatMap((shard) => shard.packages),
      [name]
    );
  }
  const empty = affectedShards(root, 4, '{"mode":"affected","workspaces":[]}');
  assert.deepEqual(
    empty.flatMap((shard) => shard.packages),
    []
  );
  const output = execFileSync(
    process.execPath,
    ['scripts/ci/run-test-shard.js', '0', '4', '--plan'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        AFFECTED_SELECTION: '{"mode":"affected","workspaces":[]}',
      },
    }
  );
  assert.match(output, /not applicable; no tests executed/);
  assert.doesNotMatch(output, /passed/);
});

test('immutable PR selector fails full on missing inputs and type filters retain dependencies', async () => {
  const { selectPullRequest, typeCheckArgs, calculate } =
    await import('./affected-apps.mjs');
  for (const event of [{}, { pull_request: { base: { sha: '--bad' } } }])
    assert.equal(
      selectPullRequest({ eventName: 'pull_request', event, cwd: root }).mode,
      'all'
    );
  assert.equal(calculate({ base: '--help', cwd: root }).mode, 'all');
  assert.deepEqual(
    typeCheckArgs({
      mode: 'affected',
      workspaces: ['packages/utils', 'apps/web'],
    }),
    [
      'turbo:local',
      'run',
      'type-check',
      '--concurrency=4',
      '--filter=./packages/utils...',
      '--filter=./apps/web...',
      '--filter=!@tuturuuu/tanstack-web',
    ]
  );
  const workflow = readWorkflow('turbo-unit-tests.yaml');
  const classifier = workflow.jobs.changes;
  assert.equal(
    classifier.steps.find((step) => step.id === 'affected').run,
    'node scripts/ci/affected-apps.mjs --ci'
  );
  assert.match(
    classifier.outputs.selection,
    /steps.affected.outputs.selection/
  );
  const shards = workflow.jobs['test-shards-pr'];
  assert.match(
    shards.env.AFFECTED_SELECTION,
    /needs.changes.outputs.selection/
  );
  for (const name of [
    'Install dependencies',
    'Build workspace setup',
    'Test',
    'Preserve complete workspace coverage',
  ])
    assert.equal(
      shards.steps.find((step) => step.name === name).if,
      "steps.plan.outputs.applicable == 'true'"
    );
  const types = readWorkflow('type-check.yaml').jobs['type-check-pr'];
  assert.equal(
    types.steps.find((step) => step.name === 'Run type check').with.command,
    'node scripts/ci/affected-apps.mjs --type-check'
  );
  assert.match(
    types.steps.find((step) => step.name === 'Install dependencies').if,
    /steps.affected.outputs.applicable/
  );
});

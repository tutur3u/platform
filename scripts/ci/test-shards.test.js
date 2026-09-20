const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
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
    ['codecov.yaml', 'test', 'test-shards', 'Run tests and collect coverage'],
  ]) {
    const workflow = readWorkflow(file);
    const job = workflow.jobs[gate];
    assert.equal(job.name, expectedName);
    assert.ok(job.needs.includes(workers));
    assert.match(job.if, /always\(\)/);
    assert.equal(workflow.jobs[workers].strategy['fail-fast'], false);
    assert.deepEqual(
      workflow.jobs[workers].strategy.matrix.shard,
      [0, 1, 2, 3]
    );
    const check = job.steps.find((step) => step.env?.TEST_RESULT);
    assert.match(
      check.env.TEST_RESULT,
      new RegExp(`needs\\.${workers}\\.result`)
    );
    // Exercise the actual shell guard, including cancellation and skipped shards.
    for (const state of ['failure', 'cancelled', 'skipped', '']) {
      assert.throws(() =>
        execFileSync('bash', ['-c', check.run], {
          env: {
            ...process.env,
            TEST_RESULT: state,
            QUALITY_RESULT: 'success',
          },
        })
      );
    }
    execFileSync('bash', ['-c', check.run], {
      env: {
        ...process.env,
        TEST_RESULT: 'success',
        QUALITY_RESULT: 'success',
      },
    });
    assert.match(
      workflow.concurrency['cancel-in-progress'],
      /refs\/heads\/main/
    );
  }
});

test('coverage is uploaded only after all complete workspace artifacts are collected', () => {
  const workflow = readWorkflow('codecov.yaml');
  const producer = workflow.jobs['test-shards'].steps.find((step) =>
    step.uses?.startsWith('actions/upload-artifact')
  );
  assert.equal(producer.with['if-no-files-found'], 'error');
  assert.match(producer.with.path, /apps\/\*\/coverage/);
  assert.match(producer.with.path, /packages\/\*\/coverage/);
  const steps = workflow.jobs.test.steps;
  const download = steps.findIndex((step) =>
    step.uses?.startsWith('actions/download-artifact')
  );
  const upload = steps.findIndex((step) => step.uses?.startsWith('codecov/'));
  assert.ok(download > 0 && upload > download);
  assert.equal(steps[download].with['merge-multiple'], true);
  assert.equal(steps[download].with.pattern, 'coverage-shard-*');
});

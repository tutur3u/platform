const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  STEP_NAME,
  WORKFLOW,
  parseMeetDurableRoomTests,
  readMeetDurableRoomTests,
} = require('../check-changed/meet-durable-room.js');
const { planChecks } = require('../check-changed/plan.js');
const { runCommand } = require('../check-changed/run-command.js');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const repoRoot = path.resolve(__dirname, '../..');
const workflow = readWorkflow(path.basename(WORKFLOW));
const lifecycle = workflow.jobs.validate.steps.find(
  (step) => step.name === STEP_NAME
);

test('check:changed runs the actual lifecycle CI test list through resource admission outside Bun preload ancestry', () => {
  assert.ok(lifecycle);
  assert.equal(lifecycle.shell, 'bash');
  const temporary = mkdtempSync(
    path.join(tmpdir(), 'meet-lifecycle-workflow-')
  );
  try {
    const bin = path.join(temporary, 'bin');
    const runner = path.join(temporary, 'runner temp');
    const workspace = path.join(temporary, 'source checkout');
    const receipt = path.join(temporary, 'receipt.json');
    mkdirSync(bin);
    mkdirSync(runner);
    mkdirSync(workspace);
    writeFileSync(
      path.join(bin, 'bun'),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.MEET_TEST_RECEIPT, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }));\n`,
      { mode: 0o755 }
    );
    const result = spawnSync('bash', ['-e', '-c', lifecycle.run], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: runner,
        GITHUB_WORKSPACE: workspace,
        MEET_TEST_RECEIPT: receipt,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(receipt, 'utf8'));
    assert.equal(realpathSync(observed.cwd), realpathSync(runner));
    const [command, ...ciFiles] = observed.argv;
    assert.equal(command, 'test');
    const ciArgs = [
      command,
      ...ciFiles.map((file) =>
        path.join(repoRoot, path.relative(workspace, file))
      ),
    ];
    const plan = planChecks([{ status: 'M', file: WORKFLOW }], {
      root: repoRoot,
      readMeetDurableRoomTests: () => readMeetDurableRoomTests(repoRoot),
      exists: (file) => existsSync(path.join(repoRoot, file)),
    });
    const local = plan.steps.find(
      (step) => step.id === 'meet-durable-room-tests'
    );
    const guards = plan.steps.find((step) => step.id === 'script-tests');
    assert.ok(local);
    assert.ok(guards);
    assert.ok(
      guards.args.includes('scripts/ci/meet-room-lifecycle-workflow.test.js')
    );

    let localCwd;
    const localResult = runCommand(local, {
      root: repoRoot,
      ttr: ['ttr', 'resources', 'run', '--'],
      spawn: (executable, args, { cwd }) => {
        localCwd = realpathSync(cwd);
        assert.equal(path.dirname(localCwd), realpathSync(tmpdir()));
        assert.deepEqual(
          [executable, ...args],
          ['ttr', 'resources', 'run', '--', 'bun', ...ciArgs]
        );
        return { status: 0 };
      },
    });
    assert.equal(localResult.status, 'pass');
    assert.equal(existsSync(localCwd), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('the lifecycle command parser rejects an empty list or extra shell commands', () => {
  for (const run of [
    'cd "$RUNNER_TEMP"\nbun test',
    `${lifecycle.run.trimEnd()}\ntrue`,
  ]) {
    const changed = { jobs: { validate: { steps: [{ ...lifecycle, run }] } } };
    assert.throws(
      () => parseMeetDurableRoomTests(changed),
      /expected "Test durable room lifecycle and recovery"/
    );
  }
});

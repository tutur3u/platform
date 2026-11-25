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

    const build = workflow.jobs.validate.steps.find(
      (step) => step.name === 'Build realtime dependencies and test realtime'
    );
    const ciBuild = build?.with?.command?.split(' && ')[0];
    assert.ok(ciBuild);

    const playgrounds = 'packages/types/dist/primitives/playgrounds.js';
    for (const file of local.requiredFiles) {
      if (file === playgrounds) continue;
      const target = path.join(workspace, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, '');
    }
    const cold = runCommand(local, {
      root: workspace,
      spawn: () => assert.fail('Missing artifacts must block the suite'),
    });
    assert.deepEqual(cold, {
      status: 'fail',
      detail: `missing workspace build artifacts: ${playgrounds}. build workspace deps first: ${ciBuild}`,
    });
    writeFileSync(path.join(workspace, playgrounds), '');

    let localCwd;
    const localResult = runCommand(local, {
      root: workspace,
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

test('the lifecycle command parser rejects malformed workflow steps', () => {
  const file = 'apps/meet-realtime/src/example.test.ts';
  const argument = `$GITHUB_WORKSPACE/${file}`;
  const command = 'cd "$RUNNER_TEMP"\nbun test';
  const run = `${command} "${argument}"`;
  const step = { name: STEP_NAME, shell: 'bash', run };
  const withRun = (run) => [{ ...step, run }];
  const withSteps = (steps) => ({ jobs: { validate: { steps } } });
  assert.deepEqual(parseMeetDurableRoomTests(withSteps([step])), [file]);

  for (const [label, steps] of [
    ['missing step', []],
    ['renamed step', [{ ...step, name: 'Durable room tests' }]],
    ['duplicate step name', [step, step]],
    ['non-Bash shell', [{ ...step, shell: 'sh' }]],
    ['empty test list', withRun(command)],
    ['extra shell command', withRun(`${run}\ntrue`)],
    ['unquoted path', withRun(`${command} ${argument}`)],
    [
      'path outside apps/meet-realtime',
      withRun(`${command} "$GITHUB_WORKSPACE/apps/meet/src/example.test.ts"`),
    ],
    ['duplicate file', withRun(`${run} "${argument}"`)],
  ]) {
    assert.throws(
      () => parseMeetDurableRoomTests(withSteps(steps)),
      /expected "Test durable room lifecycle and recovery"/,
      label
    );
  }
});

test('the lifecycle workflow loader rejects a listed file that is missing', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'meet-lifecycle-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workflowPath = path.join(root, WORKFLOW);
  const file = 'apps/meet-realtime/src/missing.test.ts';
  mkdirSync(path.dirname(workflowPath), { recursive: true });
  writeFileSync(
    workflowPath,
    `jobs:
  validate:
    steps:
      - name: ${STEP_NAME}
        shell: bash
        run: |
          cd "$RUNNER_TEMP"
          bun test "$GITHUB_WORKSPACE/${file}"
`
  );
  assert.throws(() => readMeetDurableRoomTests(root), {
    message: `${WORKFLOW}: durable room test file is missing: ${file}`,
  });
});

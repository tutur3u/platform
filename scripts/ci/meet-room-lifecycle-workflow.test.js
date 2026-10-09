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
const { parse } = require('yaml');
const repoRoot = path.resolve(__dirname, '../..');
const workflow = parse(
  readFileSync(
    path.join(repoRoot, '.github/workflows/meet-cloudflare.yaml'),
    'utf8'
  )
);

test('actual lifecycle CI command runs only its explicit worker regressions outside Bun preload ancestry', () => {
  const step = workflow.jobs.validate.steps.find(
    (step) => step.name === 'Test durable room lifecycle and recovery'
  );
  assert.ok(step);
  assert.equal(step.shell, 'bash');
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
    const result = spawnSync('bash', ['-e', '-c', step.run], {
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
    const files = [
      'room-do-empty-lifecycle.test.ts',
      'room-do-lifecycle-race.test.ts',
      'room-do-recovery.test.ts',
      'collaboration-retry-budget.test.ts',
    ].map((file) => `apps/meet-realtime/src/${file}`);
    assert.deepEqual(observed.argv, [
      'test',
      ...files.map((file) => path.join(workspace, file)),
    ]);
    for (const file of files)
      assert.ok(existsSync(path.join(repoRoot, file)), file);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

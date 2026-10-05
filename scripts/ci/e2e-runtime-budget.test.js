const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runtimeBudget } = require('./e2e-runtime-budget');

test('reserves diagnostic time after fast and slow setup', () => {
  assert.equal(runtimeBudget(1000, 1000), 2220);
  assert.equal(runtimeBudget(1000, 2200), 1020);
  assert.equal(runtimeBudget(1000, 3219), 1);
  assert.throws(() => runtimeBudget(1000, 3220), /exhausted/);
});

test('invalid clock input fails closed without starting an unbounded command', () => {
  for (const start of [undefined, NaN, 0, -1, 1.2, 2001]) {
    assert.throws(() => runtimeBudget(start, 2000), /Invalid/);
  }
  const result = spawnSync(
    process.execPath,
    [__filename.replace('.test.js', '.js'), 'private-value'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('private-value'), false);
});

test('workflow bounds both runtime commands and preserves failure artifact gates', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/e2e-tests.yaml'),
    'utf8'
  );
  assert.equal(
    (workflow.match(/timeout --signal=TERM --kill-after=30s/g) || []).length,
    2
  );
  assert.match(workflow, /E2E_JOB_STARTED_AT=\$\(date \+%s\)/);
  assert.match(
    workflow,
    /failure\(\) && steps.redact-diagnostics.outcome == 'success'/
  );
  assert.match(
    workflow,
    /name: Stop Docker web and Supabase\n {8}if: always\(\)/
  );
});

test('owned runtime deadline returns a failing status for a stalled command', () => {
  const timeout = process.platform === 'darwin' ? 'gtimeout' : 'timeout';
  const started = Date.now();
  const result = spawnSync(
    timeout,
    [
      '--signal=TERM',
      '--kill-after=0.2s',
      '0.2s',
      process.execPath,
      '-e',
      'setInterval(() => {}, 1000)',
    ],
    { encoding: 'utf8', timeout: 3000 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 124);
  assert.ok(Date.now() - started < 2500);
});

test('owned runtime deadline kills a TERM-ignoring command after readiness', async () => {
  const timeout = process.platform === 'darwin' ? 'gtimeout' : 'timeout';
  const child = spawn(
    timeout,
    [
      '--signal=TERM',
      '--kill-after=0.2s',
      '10s',
      process.execPath,
      '-e',
      // Deliberately take longer than the old 200ms deadline to become ready.
      "setTimeout(() => { process.on('SIGTERM', () => process.stdout.write('term\\n')); process.stdout.write('ready\\n'); setInterval(() => {}, 1000); }, 500)",
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  let readyAt;
  let armTimer;
  child.stdout.on('data', (chunk) => {
    output += chunk;
    if (readyAt === undefined && output.includes('ready\n')) {
      readyAt = Date.now();
      // GNU timeout handles SIGALRM as its deadline firing. Arm that deadline
      // only after the child's TERM handler is installed, not during startup.
      armTimer = setTimeout(() => child.kill('SIGALRM'), 200);
    }
  });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    // Wait for pipe EOF too: exit can precede the final stdout data event.
    child.once('close', (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(armTimer));
  assert.notEqual(readyAt, undefined, 'owned child must announce readiness');
  assert.ok(
    output.includes('term\n'),
    'installed TERM handler must receive deadline signal'
  );
  // Direct spawn reports group KILL as a signal; shell invocation reports 137.
  assert.ok(result.code === 137 || result.signal === 'SIGKILL');
  assert.ok(Date.now() - readyAt < 2500);
});

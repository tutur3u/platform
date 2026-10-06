import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  controlRaceScripts,
  openFixtureSession,
} from './time-tracker-control-concurrency.mjs';

function child() {
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  process.stdin = new EventEmitter();
  process.writes = [];
  process.ends = [];
  process.kills = [];
  process.stdin.write = (value) => process.writes.push(value);
  process.stdin.end = (value) => process.ends.push(value);
  process.kill = (signal) => {
    process.kills.push(signal);
    queueMicrotask(() => process.emit('close', null));
  };
  return process;
}

test('holder input remains open until explicit commit; end is idempotent', async () => {
  const c = child(),
    s = openFixtureSession(c);
  s.write('begin;');
  c.stdout.emit('data', 'FIXTURE_');
  c.stdout.emit('data', 'READY');
  await s.marker;
  assert.deepEqual(c.ends, []);
  s.end('commit;');
  s.end('rollback;');
  assert.deepEqual(c.ends, ['commit;']);
  c.emit('close', 0);
  assert.equal((await s.done).code, 0);
});

test('session closure without readiness cannot establish lock proof', async () => {
  const c = child(),
    s = openFixtureSession(c);
  c.emit('close', 0);
  await assert.rejects(s.marker, /readiness missing/u);
  assert.equal((await s.done).code, 0);
});

test('deadline rejects readiness and completion and terminates owned child', async () => {
  const c = child(),
    s = openFixtureSession(c, 10);
  await Promise.all([
    assert.rejects(s.marker, /timed out/u),
    assert.rejects(s.done, /timed out/u),
  ]);
  assert.deepEqual(c.kills, ['SIGTERM']);
});

test('oversized output fails before unbounded log accumulation', async () => {
  const c = child(),
    s = openFixtureSession(c);
  c.stdout.emit('data', 'x'.repeat(65537));
  await assert.rejects(s.done, /output exceeded limit/u);
  assert.deepEqual(c.kills, ['SIGTERM']);
});

test('spawn failure emits a fixed message and never raw credential-bearing error', async () => {
  const c = child(),
    s = openFixtureSession(c);
  c.emit('error', new Error('synthetic-secret/path'));
  await assert.rejects(s.done, {
    message: 'Control fixture session failed to start',
  });
});

test('SQL failure result retains exit status for strict concurrency assertions', async () => {
  const c = child(),
    s = openFixtureSession(c);
  c.stdout.emit('data', 'FIXTURE_READY');
  c.stderr.emit('data', 'ERROR: 40001: Control revision conflict');
  c.emit('close', 3);
  const result = await s.done;
  assert.equal(result.code, 3);
  assert.match(result.errors, /40001/u);
});

test('exact-head CI replays full schema, strict TAP, concurrency and real typegen', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/time-tracker-control-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  const verifier = readFileSync(
    new URL('./verify-time-tracker-control-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/u
  );
  const checkout = workflow.match(
    /- uses: actions\/checkout@[^\n]+\n([\s\S]*?)(?=\n {6}-|$)/u
  )?.[1];
  assert.ok(checkout, 'contract must check out its exact candidate');
  assert.match(checkout, /persist-credentials: false/u);
  assert.match(workflow, /permissions:\n {2}contents: read/u);
  assert.match(workflow, /CONTRACT_ENABLED/u);
  assert.match(workflow, /test "\$CONTRACT_ENABLED" = true/u);
  assert.match(workflow, /branches: \[main, production\]/u);
  assert.match(
    workflow,
    /time-tracker-control-types-\$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/u
  );
  assert.match(verifier, /stageDisposableProject/u);
  assert.match(verifier, /assertStrictTap\(tap\)/u);
  assert.match(verifier, /await runTimeTrackerControlConcurrency\(metadata\)/u);
  assert.match(
    verifier,
    /metadata.typegenOutput = 'packages\/types\/src\/supabase.ts'/u
  );
  assert.match(verifier, /await runIsolatedLifecycle/u);
  assert.doesNotMatch(verifier, /sb:push|db push/u);
  const registry = readFileSync(
    new URL('../../../tuturuuu.ci.ts', import.meta.url),
    'utf8'
  );
  assert.match(registry, /'time-tracker-control-contract.yaml': true/u);
});

test('actual emitted holder and competitor stdin retain psql metacommands', async () => {
  const scripts = controlRaceScripts(1, '000000090632', '000000090633');
  const holder = child(),
    competitor = child();
  const first = openFixtureSession(holder),
    second = openFixtureSession(competitor);
  first.write(scripts.holder);
  second.end(scripts.competitor);
  holder.stdout.emit('data', 'FIXTURE_READY');
  competitor.stdout.emit('data', 'FIXTURE_READY');
  holder.emit('close', 0);
  competitor.emit('close', 3);
  await Promise.all([first.done, second.done]);
  const holdingLines = holder.writes[0].split('\n');
  const competingLines = competitor.ends[0].split('\n');
  assert(
    holdingLines.includes('\\echo FIXTURE_READY'),
    'holder must emit a real psql echo'
  );
  assert.equal(competingLines[0], '\\set VERBOSITY verbose');
  assert(
    competingLines.includes('\\echo FIXTURE_READY'),
    'competitor must emit a real psql echo'
  );
});

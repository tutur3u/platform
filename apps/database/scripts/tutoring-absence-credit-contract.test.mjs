import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertStrictTap } from './programming-database-tap.mjs';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';
import {
  absenceCreateCommand,
  absenceFixtureId,
  absenceRaceScripts,
  absenceSeedSql,
} from './tutoring-absence-credit-concurrency.mjs';

function child() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.stdin = new EventEmitter();
  c.writes = [];
  c.ends = [];
  c.kills = [];
  c.stdin.write = (value) => c.writes.push(value);
  c.stdin.end = (value) => c.ends.push(value);
  c.kill = (signal) => {
    c.kills.push(signal);
    queueMicrotask(() => c.emit('close', null));
  };
  return c;
}
test('actual emitted contender scripts contain real psql metacommands and readiness lines', () => {
  const scripts = absenceRaceScripts(
    absenceCreateCommand(92851, 92871),
    absenceCreateCommand(92851, 92872)
  );
  assert.deepEqual(scripts.holder.split('\n').slice(-2), [
    '\\echo FIXTURE_READY',
    '',
  ]);
  assert.equal(scripts.competitor.split('\n')[0], '\\set VERBOSITY verbose');
  assert.ok(scripts.competitor.split('\n').includes('\\echo FIXTURE_READY'));
  assert.ok(!scripts.holder.includes('\\n'));
  assert.match(scripts.release, /wait_event_type='Lock'/u);
  assert.match(scripts.release, /deadline.*3 seconds/u);
});
test('actual command binds explicit occurrence identity, actor and unique request without date inference', () => {
  const a = absenceCreateCommand(92851, 92871),
    b = absenceCreateCommand(92852, 92871);
  assert.ok(a.includes(absenceFixtureId(92851)));
  assert.ok(b.includes(absenceFixtureId(92852)));
  assert.notEqual(a, b);
  assert.ok(a.includes(absenceFixtureId(92801)));
  assert.ok(a.includes(absenceFixtureId(92871)));
});
test('real generated holder input keeps transaction open until observed blocker receipt', async () => {
  const c = child(),
    s = openFixtureSession(c, 1000);
  const scripts = absenceRaceScripts('select 1;', 'select 2;');
  s.write(scripts.holder);
  c.stdout.emit('data', 'FIXTURE_');
  c.stdout.emit('data', 'READY');
  await s.marker;
  assert.deepEqual(c.writes, [scripts.holder]);
  assert.deepEqual(c.ends, []);
  s.end(scripts.release);
  s.end('rollback;');
  assert.deepEqual(c.ends, [scripts.release]);
  c.emit('close', 0);
  assert.equal((await s.done).code, 0);
});
test('contender readiness cannot be inferred from successful premature process closure', async () => {
  const c = child(),
    s = openFixtureSession(c, 1000);
  c.emit('close', 0);
  await assert.rejects(s.marker, /readiness missing/u);
  assert.equal((await s.done).code, 0);
});
test('owned fixture timeout terminates child rather than fabricating lock proof', async () => {
  const c = child(),
    s = openFixtureSession(c, 10);
  await Promise.all([
    assert.rejects(s.marker, /timed out/u),
    assert.rejects(s.done, /timed out/u),
  ]);
  assert.deepEqual(c.kills, ['SIGTERM']);
});
test('generated seed uses synthetic scoped membership and distinct civil attendance dates', () => {
  const sql = absenceSeedSql();
  assert.ok(sql.includes("'MEMBER'"));
  assert.ok(sql.includes("'STUDENT'"));
  assert.ok(sql.includes("'TEACHER'"));
  for (const n of [92851, 92852, 92853, 92854])
    assert.ok(sql.includes(absenceFixtureId(n)));
});
test('strict TAP rejects missing, skipped or failed DB assertions', () => {
  assert.doesNotThrow(() => assertStrictTap('ok 1 - actual contract\n1..1\n'));
  for (const tap of [
    '1..1\n',
    'ok 1 - ignored # SKIP\n1..1\n',
    'not ok 1 - failed\n1..1\n',
  ]) {
    assert.throws(() => assertStrictTap(tap));
  }
});
test('exact-head workflow cannot silently skip enabled full-schema proof or type artifact', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/tutoring-absence-credit-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  const verifier = readFileSync(
    new URL('./verify-tutoring-absence-credit-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(
    workflow,
    /ref:.*github.event.pull_request.head.sha.*github.sha/u
  );
  assert.match(workflow, /test "\$CONTRACT_ENABLED" = true/u);
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(workflow, /tutoring-absence-credit-types-.*github.sha/u);
  assert.match(verifier, /runIsolatedLifecycle/u);
  assert.match(verifier, /assertStrictTap\(tap\)/u);
  assert.match(verifier, /runTutoringAbsenceConcurrency\(metadata\)/u);
  assert.match(verifier, /tutoring-absence-credit-lifecycle.sql/u);
  assert.match(
    verifier,
    /metadata.typegenOutput = 'packages\/types\/src\/supabase.ts'/u
  );
});

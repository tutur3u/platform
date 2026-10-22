import assert from 'node:assert/strict';
import test from 'node:test';
import {
  joinProfileReadEvents,
  parseProfileReadEvents,
} from './mail-profile-correlation.mjs';

const a = 'a'.repeat(32);
const b = 'b'.repeat(32);
const event = (requestId, stage, event, elapsedMs = 0) => ({
  version: 1,
  requestId,
  stage,
  event,
  elapsedMs,
});
const entry = (id) => event(id, 'proxy', 'entry');
const read = (id, kind = 'started') =>
  event(id, 'profile actor', kind, kind === 'started' ? 0 : 25);
const log = (events) =>
  events
    .map((item) => `[lettin-profile-read] ${JSON.stringify(item)}\n`)
    .join('');
const hop = (id, extra = {}) => ({
  route: 'profile',
  status: 200,
  targetRoute: 'unavailable',
  requestId: id,
  ...extra,
});
const result = (hops, extra = {}) => ({
  title: 'profile',
  status: 'timedOut',
  navigationDiagnostics: {
    state: 'observed',
    record: { truncated: false, hops, ...extra },
  },
});
const joined = (results, events) =>
  joinProfileReadEvents(results, parseProfileReadEvents(log(events)));

test('interleaved requests join solely by actual main profile response ID', () => {
  const events = [entry(a), entry(b), read(b), read(a), read(b, 'completed')];
  const results = joined([result([hop(b)]), result([hop(a)])], events);
  assert.equal(results[0].readCorrelation.requestId, b);
  assert.equal(results[0].readCorrelation.observations.length, 2);
  assert.equal(results[1].readCorrelation.requestId, a);
  assert.equal(results[1].readCorrelation.observations.length, 1);
  assert.ok(
    results.every(
      (item) => item.readCorrelation.rendererCompletion === 'unknown'
    )
  );
});

test('redirect identity cannot attribute the destination document', () => {
  const results = joined(
    [result([hop(a, { status: 307, targetRoute: 'profile' }), hop(b)])],
    [entry(a), read(a), entry(b), read(b)]
  );
  assert.equal(results[0].readCorrelation.requestId, b);
  const missing = joined(
    [result([hop(a, { status: 307, targetRoute: 'profile' }), hop(undefined)])],
    [entry(a), read(a)]
  );
  assert.equal(missing[0].readCorrelation.state, 'unknown');
});

test('missing, malformed, duplicate, ambiguous, cross-attempt and truncated evidence stays unknown', () => {
  const events = [entry(a), read(a), read(a, 'completed')];
  for (const results of [
    [result([hop(undefined)])],
    [result([hop('invalid')])],
    [result([hop(a), hop(b)])],
    [result([hop(a)]), result([hop(a)])],
    [result([hop(a)], { truncated: true })],
    [{ navigationDiagnostics: { state: 'unknown', reason: 'attempt' } }],
  ])
    assert.ok(
      joined(results, events).every(
        (item) => item.readCorrelation.state === 'unknown'
      )
    );
  for (const bad of [
    [],
    [read(a)],
    [...events, read(a)],
    [...events, entry(a)],
    [entry(a), read(a, 'completed')],
    [...events, read(a, 'failed')],
  ]) {
    assert.equal(
      joined([result([hop(a)])], bad)[0].readCorrelation.state,
      'unknown'
    );
  }
  for (const parsed of [
    parseProfileReadEvents(log(events), true),
    parseProfileReadEvents(log(events).trimEnd()),
    parseProfileReadEvents('[lettin-profile-read] {broken}\n'),
    parseProfileReadEvents(log([event(a, 'raw private stage', 'started')])),
    parseProfileReadEvents(log(Array.from({ length: 513 }, () => entry(a)))),
    parseProfileReadEvents(log([{ ...entry(a), requestId: [a] }])),
  ])
    assert.equal(
      joinProfileReadEvents([result([hop(a)])], parsed)[0].readCorrelation
        .state,
      'unknown'
    );
});

test('old aggregate observations and terminal outcome are preserved', () => {
  const old = {
    title: 'profile',
    status: 'failed',
    navigationDiagnostics: { state: 'unknown' },
    oldAggregate: 7,
  };
  const transport = { title: 'transport', status: 'passed' };
  const results = joined([old, transport], []);
  assert.equal(results[0].oldAggregate, 7);
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].navigationDiagnostics, old.navigationDiagnostics);
  assert.equal(results[1], transport);
});

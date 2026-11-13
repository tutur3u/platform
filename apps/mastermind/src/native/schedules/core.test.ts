import { expect, test } from 'vitest';
import {
  claimOccurrence,
  claimToken,
  instant,
  occurrenceKey,
  pendingOccurrence,
  recordOutcome,
  revision,
  scheduleId,
  selectCalendarPeriod,
  selectIntervalPeriod,
  type Refusal,
} from './core';

const id = scheduleId('schedule_1');
const rev = revision(1);
const token = claimToken('claim_1');
const period = instant(1_000);

function pending() {
  return pendingOccurrence({
    scheduleId: id,
    scheduledFor: period,
    revision: rev,
  });
}

function claimed() {
  const decision = claimOccurrence({
    occurrence: pending(),
    currentRevision: rev,
    now: period,
    token,
    budgetMs: 100,
    eligibility: { kind: 'eligible' },
  });
  if (decision.kind !== 'dispatch') throw new Error('Expected a dispatch');
  return decision.occurrence;
}

test.each([-1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid epoch milliseconds %s',
  (value) => expect(() => instant(value)).toThrow(RangeError)
);

test('validates identifiers and revisions before constructing domain values', () => {
  expect(() => scheduleId('')).toThrow(RangeError);
  expect(() => claimToken('line\nbreak')).toThrow(RangeError);
  expect(() => revision(0)).toThrow(RangeError);
  expect(() => revision(1.5)).toThrow(RangeError);
});

test('a revision cannot create a second key for the same scheduled period', () => {
  const first = pending();
  const next = { ...first, revision: revision(2) };
  expect(occurrenceKey(first)).toBe(occurrenceKey(next));
  expect(occurrenceKey({ ...first, scheduledFor: instant(1_001) })).not.toBe(
    occurrenceKey(first)
  );
});

test('a future occurrence does not dispatch', () => {
  const occurrence = pending();
  expect(
    claimOccurrence({
      occurrence,
      currentRevision: rev,
      now: instant(999),
      token,
      budgetMs: 100,
      eligibility: { kind: 'eligible' },
    })
  ).toEqual({ kind: 'idle', occurrence });
});

const refusals: readonly Refusal[] = [
  'flag_off',
  'paused',
  'disabled',
  'stop',
  'workspace',
  'agent',
  'recipient',
  'permission',
  'rate',
];

test.each(refusals)('%s closes a due occurrence without dispatch', (reason) => {
  const result = claimOccurrence({
    occurrence: pending(),
    currentRevision: rev,
    now: period,
    token,
    budgetMs: 100,
    eligibility: { kind: 'refused', reason },
  });
  expect(result.kind).toBe('idle');
  expect(result.occurrence).toEqual({
    scheduleId: id,
    scheduledFor: period,
    revision: rev,
    kind: 'closed',
    outcome: { kind: 'refused', reason },
  });
});

test('an obsolete revision is cancelled before dispatch', () => {
  const result = claimOccurrence({
    occurrence: pending(),
    currentRevision: revision(2),
    now: period,
    token,
    budgetMs: 100,
    eligibility: { kind: 'eligible' },
  });
  expect(result.kind).toBe('idle');
  expect(result.occurrence).toMatchObject({
    kind: 'closed',
    outcome: { kind: 'cancelled' },
    revision: rev,
  });
});

test('duplicate wakes do not dispatch an active claim', () => {
  const occurrence = claimed();
  expect(
    claimOccurrence({
      occurrence,
      currentRevision: rev,
      now: instant(1_001),
      token: claimToken('another'),
      budgetMs: 100,
      eligibility: { kind: 'eligible' },
    })
  ).toEqual({ kind: 'idle', occurrence });
});

test('an expired claim becomes terminal UNKNOWN and never dispatches again', () => {
  const input = {
    occurrence: claimed(),
    currentRevision: rev,
    now: instant(1_100),
    token: claimToken('another'),
    budgetMs: 100,
    eligibility: { kind: 'eligible' as const },
  };
  const expired = claimOccurrence(input);
  expect(expired.kind).toBe('idle');
  expect(expired.occurrence).toMatchObject({
    kind: 'closed',
    outcome: { kind: 'unknown' },
  });
  expect(
    claimOccurrence({
      ...input,
      occurrence: expired.occurrence,
      now: instant(2_000),
    })
  ).toEqual({ kind: 'idle', occurrence: expired.occurrence });
});

test('only the owning claim can record an outcome', () => {
  const occurrence = claimed();
  expect(
    recordOutcome({
      occurrence,
      token: claimToken('wrong'),
      now: instant(1_001),
      outcome: { kind: 'completed' },
    })
  ).toBe(occurrence);
});

test('late completion is UNKNOWN; a second result cannot overwrite it', () => {
  const closed = recordOutcome({
    occurrence: claimed(),
    token,
    now: instant(1_100),
    outcome: { kind: 'completed' },
  });
  expect(closed).toMatchObject({
    kind: 'closed',
    outcome: { kind: 'unknown' },
  });
  expect(
    recordOutcome({
      occurrence: closed,
      token,
      now: instant(1_101),
      outcome: { kind: 'completed' },
    })
  ).toBe(closed);
});

test('a quiet heartbeat records no_action without changing its identity', () => {
  const closed = recordOutcome({
    occurrence: claimed(),
    token,
    now: instant(1_001),
    outcome: { kind: 'no_action' },
  });
  expect(closed).toMatchObject({
    kind: 'closed',
    outcome: { kind: 'no_action' },
  });
  expect(occurrenceKey(closed)).toBe(occurrenceKey(pending()));
});

test.each([0, -1, NaN, 60_001, 1.5])(
  'refuses an unbounded budget %s',
  (budgetMs) => {
    expect(() =>
      claimOccurrence({
        occurrence: pending(),
        currentRevision: rev,
        now: period,
        token,
        budgetMs,
        eligibility: { kind: 'eligible' },
      })
    ).toThrow(RangeError);
  }
);

test('missed calendar periods collapse to one catch-up', () => {
  expect(
    selectCalendarPeriod({
      periods: [instant(100), instant(200), instant(300), instant(400)],
      now: instant(350),
      closedThrough: null,
    })
  ).toEqual({ kind: 'due', scheduledFor: 300, missed: 2, nextDueAt: 400 });
});

test('closed calendar periods are not reopened by clock or revision changes', () => {
  expect(
    selectCalendarPeriod({
      periods: [instant(100), instant(200), instant(300)],
      now: instant(150),
      closedThrough: instant(200),
    })
  ).toEqual({ kind: 'future', nextDueAt: 300 });
});

test('calendar windows reject duplicate, unordered and unbounded input', () => {
  for (const periods of [
    [instant(100), instant(100)],
    [instant(200), instant(100)],
    Array.from({ length: 1_001 }, (_, index) => instant(index)),
  ]) {
    expect(() =>
      selectCalendarPeriod({ periods, now: instant(500), closedThrough: null })
    ).toThrow(RangeError);
  }
});

test('supplied UTC periods retain their identity across a DST offset change', () => {
  const before = instant(Date.parse('2026-03-07T07:30:00Z'));
  const after = instant(Date.parse('2026-03-09T06:30:00Z'));
  expect(
    selectCalendarPeriod({
      periods: [before, after],
      now: after,
      closedThrough: before,
    })
  ).toEqual({ kind: 'due', scheduledFor: after, missed: 0, nextDueAt: null });
});

test('empty calendar windows require another qualified window', () => {
  expect(
    selectCalendarPeriod({
      periods: [],
      now: instant(100),
      closedThrough: null,
    })
  ).toEqual({ kind: 'exhausted' });
});

test('interval catch-up selects one period and preserves the next future deadline', () => {
  expect(
    selectIntervalPeriod({
      anchor: instant(100),
      intervalMs: 10,
      now: instant(145),
      closedThrough: instant(110),
    })
  ).toEqual({ kind: 'due', scheduledFor: 140, missed: 2, nextDueAt: 150 });
});

test('an already closed interval cannot replay after a clock rollback', () => {
  expect(
    selectIntervalPeriod({
      anchor: instant(100),
      intervalMs: 10,
      now: instant(125),
      closedThrough: instant(140),
    })
  ).toEqual({ kind: 'future', nextDueAt: 150 });
});

test('a future interval waits and a malformed interval refuses', () => {
  const input = { anchor: instant(100), now: instant(50), closedThrough: null };
  expect(selectIntervalPeriod({ ...input, intervalMs: 10 })).toEqual({
    kind: 'future',
    nextDueAt: 100,
  });
  expect(() => selectIntervalPeriod({ ...input, intervalMs: 0 })).toThrow(
    RangeError
  );
});

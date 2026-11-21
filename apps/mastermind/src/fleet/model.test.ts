import { expect, test } from 'vitest';
import { answerReducer, type AnswerState } from './answer';
import { fleetStateResponseSchema } from './contract';
import { fleetResponseFixture } from './fleet-fixture';
import {
  activity,
  approvals,
  digest,
  formatRemaining,
  inbox,
  loginRequests,
} from './model';
import { fleetPageState, mergeRefresh } from './page-state';
import { parseSnoozes, snoozeUntil } from './snooze';

const now = Date.now();
const snapshot = fleetResponseFixture(now);
const parsed = fleetStateResponseSchema.parse(snapshot);

test('the fixture passes the shared Web contract', () => {
  expect(parsed.state.decisions).toHaveLength(4);
  expect(parsed.state.decisions[3]?.login?.userCode).toBe('ABCD-1234');
});

test('inbox: login requests never appear; answered and snoozed split out', () => {
  const views = inbox(parsed, { 'ci-sample': now + 60_000 }, now);
  expect(views.open.map((item) => item.decision.id)).toEqual(['roll-back']);
  expect(views.snoozed.map((item) => item.decision.id)).toEqual(['ci-sample']);
  expect(views.answered[0]?.receipt?.revision).toBe(2);
  const expired = inbox(parsed, { 'ci-sample': now - 1 }, now);
  expect(expired.open.map((item) => item.decision.id)).toContain('ci-sample');
});

test('digest counts only real data, and logins expire on the clock', () => {
  const d = digest(parsed, {}, now);
  expect(d).toMatchObject({
    running: 3,
    machinesOnline: 1,
    machines: 2,
    needYou: 1,
  });
  expect(d.logins).toEqual([{ service: 'github', machine: 'Devbox' }]);
  expect(digest(parsed, {}, now + 601_000).logins).toEqual([]);
  expect(loginRequests(parsed.state, new Date(now + 601_000))[0]?.state).toBe(
    'expired'
  );
});

test('activity and approvals come from snapshot timestamps, newest first', () => {
  const events = activity(parsed.state);
  expect(events.map((event) => event.kind)).toEqual([
    'lane',
    'asked',
    'asked',
    'asked',
    'asked',
    'resolved',
    'deployed',
  ]);
  const rows = approvals(parsed);
  expect(rows[0]).toMatchObject({
    answer: 'Ship now',
    revision: 2,
    pickedUp: false,
  });
  expect(rows[1]).toMatchObject({ answer: 'Retire it', via: 'whatsapp' });
});

test('snooze choices and stored snoozes', () => {
  expect(snoozeUntil('15m', now)).toBe(now + 900_000);
  expect(snoozeUntil('deadline', now)).toBeNull();
  expect(
    snoozeUntil('deadline', now, new Date(now + 120_000).toISOString())
  ).toBeNull();
  expect(
    snoozeUntil('deadline', now, new Date(now + 3_600_000).toISOString())
  ).toBe(now + 3_300_000);
  const morning = new Date(snoozeUntil('morning', now) ?? 0);
  expect(morning.getHours()).toBe(8);
  expect(morning.getTime()).toBeGreaterThan(now);
  expect(parseSnoozes('{"a":1,"b":"x","c":99999999999999}', now)).toEqual({
    c: 99999999999999,
  });
  expect(parseSnoozes('not json', now)).toEqual({});
});

test('page state: stale on age or failed refresh, error and unpublished otherwise', () => {
  const ready = {
    email: 'o',
    fetchedAt: '',
    read: { kind: 'ready' as const, snapshot: parsed },
  };
  expect(fleetPageState(ready, now).kind).toBe('ready');
  const threshold = Date.parse(parsed.state.generatedAt) + 120_000;
  expect(fleetPageState(ready, threshold).kind).toBe('ready');
  expect(fleetPageState(ready, threshold + 1)).toMatchObject({
    kind: 'stale',
    reason: 'old',
  });
  const offline = {
    ...ready,
    read: {
      ...ready.read,
      snapshot: {
        ...parsed,
        state: {
          ...parsed.state,
          orchestrator: {
            ...parsed.state.orchestrator,
            state: 'offline' as const,
          },
        },
      },
    },
  };
  expect(fleetPageState(offline, now)).toMatchObject({
    kind: 'stale',
    reason: 'orchestratorOffline',
  });
  expect(fleetPageState(offline, threshold + 1)).toMatchObject({
    kind: 'stale',
    reason: 'old',
  });
  const failed = {
    ...ready,
    read: { kind: 'error' as const, reason: 'unavailable' as const },
  };
  expect(fleetPageState(mergeRefresh(ready, failed), now)).toMatchObject({
    kind: 'stale',
    reason: 'unavailable',
  });
  expect(fleetPageState(mergeRefresh(undefined, failed), now).kind).toBe(
    'error'
  );
  expect(
    fleetPageState({ ...ready, read: { kind: 'unpublished' } }, now).kind
  ).toBe('unpublished');
});

test('answer machine: undo window, one send, no automatic resend', () => {
  const input = {
    action: 'approve' as const,
    optionId: 'rollback',
    idempotencyKey: crypto.randomUUID(),
  };
  let state: AnswerState = { kind: 'idle' };
  state = answerReducer(state, { type: 'queue', input, now });
  expect(state).toMatchObject({ kind: 'pending', sendsAt: now + 5_000 });
  expect(answerReducer(state, { type: 'undo' })).toEqual({ kind: 'idle' });
  const elsewhere = {
    action: 'hold' as const,
    revision: 4,
    answeredAt: new Date(now).toISOString(),
    pickedUp: false,
  };
  expect(
    answerReducer(state, { type: 'supersede', receipt: elsewhere })
  ).toEqual({ kind: 'superseded', receipt: elsewhere });
  expect(answerReducer(state, { type: 'block' })).toEqual({
    kind: 'error',
    maybeSent: false,
  });
  const sending = answerReducer(state, { type: 'send' });
  expect(answerReducer(sending, { type: 'undo' })).toBe(sending);
  const failed = answerReducer(sending, {
    type: 'result',
    result: { kind: 'error', reason: 'invalid' },
  });
  expect(failed).toEqual({ kind: 'error', maybeSent: true });
  // A refused send never queues again by itself; a fresh check decides.
  expect(answerReducer(failed, { type: 'queue', input, now })).toBe(failed);
  expect(answerReducer(failed, { type: 'checked', open: true })).toEqual({
    kind: 'idle',
  });
  expect(answerReducer(failed, { type: 'checked', open: false })).toEqual({
    kind: 'closed',
  });
  const receipt = {
    action: 'approve' as const,
    revision: 3,
    answeredAt: new Date(now).toISOString(),
    pickedUp: false,
  };
  expect(
    answerReducer(failed, { type: 'checked', open: true, receipt })
  ).toEqual({ kind: 'sent', receipt });
  expect(
    answerReducer(sending, { type: 'result', result: { kind: 'closed' } })
  ).toEqual({ kind: 'closed' });
  expect(answerReducer({ kind: 'idle' }, { type: 'send' })).toEqual({
    kind: 'idle',
  });
});

test('an unreachable send retries with the same key until it lands', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  const input = { action: 'hold' as const, idempotencyKey: 'key-1' };
  let state: AnswerState = { kind: 'sending', input };
  const delays: number[] = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    state = answerReducer(state, {
      type: 'result',
      result: { kind: 'error', reason: 'unavailable' },
      now,
    });
    if (state.kind !== 'retrying') throw new Error('expected retrying');
    expect(state.input.idempotencyKey).toBe('key-1');
    delays.push(state.retryAt - now);
    state = answerReducer(state, { type: 'retry' });
    expect(state).toMatchObject({ kind: 'sending', input });
  }
  expect(delays).toEqual([5_000, 15_000, 60_000, 120_000, 120_000]);

  const retrying = answerReducer(state, {
    type: 'result',
    result: { kind: 'error', reason: 'unavailable' },
    now,
  });
  // Still open with no receipt: keep retrying.
  expect(answerReducer(retrying, { type: 'checked', open: true })).toBe(
    retrying
  );
  expect(answerReducer(retrying, { type: 'checked', open: false })).toEqual({
    kind: 'closed',
  });
  const receipt = {
    action: 'hold' as const,
    revision: 1,
    answeredAt: new Date(now).toISOString(),
    pickedUp: false,
  };
  expect(
    answerReducer(retrying, { type: 'checked', open: true, receipt })
  ).toEqual({ kind: 'sent', receipt });
  expect(answerReducer(retrying, { type: 'supersede', receipt })).toEqual({
    kind: 'superseded',
    receipt,
  });
  expect(
    answerReducer(answerReducer(retrying, { type: 'retry' }), {
      type: 'result',
      result: { kind: 'closed' },
    })
  ).toEqual({ kind: 'closed' });
});

test('countdown formatting', () => {
  expect(formatRemaining(1_140_000)).toBe('19:00');
  expect(formatRemaining(5_409_000)).toBe('1:30:09');
  expect(formatRemaining(-5)).toBe('0:00');
});

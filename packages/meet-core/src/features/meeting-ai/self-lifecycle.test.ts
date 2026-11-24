import { describe, expect, it } from 'vitest';
import {
  nextSelfLifecycle,
  type SelfLifecycle,
  type SelfLifecycleEvent,
  selfCaptureViewOf,
} from './self-lifecycle';

const run = (
  events: SelfLifecycleEvent[],
  from: SelfLifecycle = { kind: 'idle' }
) => events.reduce(nextSelfLifecycle, from);
const opened: SelfLifecycleEvent = {
  type: 'opened',
  streamId: 's1',
  consentRevision: 2,
  leaseExpiresAt: 1000,
};

describe('stream lifecycle', () => {
  it('opens when eligible and renews', () => {
    const state = run([
      { type: 'eligible', key: 'a:0' },
      opened,
      { type: 'renewed', leaseExpiresAt: 5000 },
    ]);
    expect(state).toMatchObject({ kind: 'open', leaseExpiresAt: 5000 });
    expect(selfCaptureViewOf(state)).toEqual({ kind: 'capturing' });
  });

  it('treats a failed renewal inside the lease as paused, then recovers', () => {
    const degraded = run([
      { type: 'eligible', key: 'a:0' },
      opened,
      { type: 'renew_failed', failure: 'retry', now: 500 },
    ]);
    expect(selfCaptureViewOf(degraded)).toEqual({ kind: 'paused' });
    expect(
      selfCaptureViewOf(
        nextSelfLifecycle(degraded, { type: 'renewed', leaseExpiresAt: 9000 })
      )
    ).toEqual({ kind: 'capturing' });
  });

  it('reopens a stream whose lease lapsed', () => {
    const state = run([
      { type: 'eligible', key: 'a:0' },
      opened,
      { type: 'renew_failed', failure: 'retry', now: 1000 },
    ]);
    expect(state).toEqual({ kind: 'opening', key: 'a:0' });
  });

  it('stops for good on a refusal until the join key changes', () => {
    const refused = run([
      { type: 'eligible', key: 'a:0' },
      opened,
      { type: 'refused', failure: 'refused' },
    ]);
    expect(refused).toEqual({ kind: 'refused', key: 'a:0' });
    expect(selfCaptureViewOf(refused)).toEqual({ kind: 'stopped' });
    expect(nextSelfLifecycle(refused, { type: 'eligible', key: 'a:0' })).toBe(
      refused
    );
    expect(
      nextSelfLifecycle(refused, { type: 'eligible', key: 'a:1' })
    ).toEqual({ kind: 'opening', key: 'a:1' });
  });

  it('refuses on a renew 409 and on an ineligible open', () => {
    expect(
      run([
        { type: 'eligible', key: 'a:0' },
        opened,
        { type: 'renew_failed', failure: 'refused', now: 1 },
      ]).kind
    ).toBe('refused');
    const guest = run([
      { type: 'eligible', key: 'a:0' },
      { type: 'open_failed', failure: 'not_eligible' },
    ]);
    expect(selfCaptureViewOf(guest)).toEqual({ kind: 'guest' });
  });

  it('backs off after a retryable open failure', () => {
    const state = run([
      { type: 'eligible', key: 'a:0' },
      { type: 'open_failed', failure: 'retry', attempt: 0 },
    ]);
    expect(state).toEqual({ kind: 'backoff', key: 'a:0', attempt: 1 });
    expect(nextSelfLifecycle(state, { type: 'backoff_elapsed' })).toEqual({
      kind: 'opening',
      key: 'a:0',
    });
  });

  it('returns to idle when no longer eligible', () => {
    expect(
      run([{ type: 'eligible', key: 'a:0' }, opened, { type: 'ineligible' }])
    ).toEqual({ kind: 'idle' });
  });

  it('ignores a stale open result after the lifecycle moved on', () => {
    expect(run([opened])).toEqual({ kind: 'idle' });
  });
});

describe('stream lifecycle lease expiry', () => {
  it('reopens on a lapsed lease from a chunk or a renewal', () => {
    const open = run([{ type: 'eligible', key: 'a:0' }, opened]);
    expect(nextSelfLifecycle(open, { type: 'lease_expired' })).toEqual({
      kind: 'opening',
      key: 'a:0',
    });
    expect(
      nextSelfLifecycle(open, {
        type: 'renew_failed',
        failure: 'lease_expired',
        now: 0,
      })
    ).toEqual({ kind: 'opening', key: 'a:0' });
    expect(
      nextSelfLifecycle({ kind: 'idle' }, { type: 'lease_expired' })
    ).toEqual({ kind: 'idle' });
  });
});

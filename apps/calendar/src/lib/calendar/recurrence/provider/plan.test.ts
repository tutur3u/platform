import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import { describe, expect, it, vi } from 'vitest';
import {
  executeProviderSeriesOperation,
  type ProviderSeriesOperationStore,
} from './executor';
import {
  googleSeriesPayload,
  graphSeriesPayload,
  type ProviderSeriesSnapshot,
} from './payload';
import { providerSeriesCreatePlan, providerSeriesMutationPlan } from './plan';

const current: ProviderSeriesSnapshot = {
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'America/New_York',
    end: { type: 'count', count: 5 },
  },
  anchor: {
    startLocal: '2026-03-06T09:00:00',
    endLocal: '2026-03-06T10:00:00',
    allDay: false,
  },
  event: { title: 'Series', description: 'Details', location: 'Room' },
};
const binding = {
  provider: 'google' as const,
  connectionId: 'connection',
  calendarId: 'calendar',
  masterId: 'master',
  etag: 'v1',
};
const mutate = (
  scope: 'this' | 'all' | 'future',
  action: 'update' | 'delete' = 'update',
  originalStartLocal = '2026-03-08T09:00:00'
) =>
  providerSeriesMutationPlan({
    operationId: 'request',
    binding,
    current,
    scope,
    action,
    originalStartLocal,
  });

describe('provider series payload and scope parity', () => {
  it('retains local wall-clock timezone rather than shifting future DST times to UTC', () => {
    expect(googleSeriesPayload(current).start).toEqual({
      dateTime: '2026-03-06T09:00:00',
      timeZone: 'America/New_York',
    });
    expect(
      graphSeriesPayload(current).recurrence?.range.recurrenceTimeZone
    ).toBe('America/New_York');
  });
  it('uses exclusive dates for Google all-day and explicit Graph isAllDay', () => {
    const allDay = {
      ...current,
      anchor: {
        startLocal: '2026-03-06T00:00:00',
        endLocal: '2026-03-07T00:00:00',
        allDay: true,
      },
    };
    expect(googleSeriesPayload(allDay).end).toEqual({ date: '2026-03-07' });
    expect(graphSeriesPayload(allDay).isAllDay).toBe(true);
  });
  it('never silently converts RFC missing-month-day skipping into Graph clamping', () => {
    const rule: CalendarRecurrenceRule = {
      ...current.rule,
      frequency: 'monthly',
      monthDay: 31,
    };
    const snapshot = {
      ...current,
      rule,
      anchor: {
        ...current.anchor,
        startLocal: '2026-03-31T09:00:00',
        endLocal: '2026-03-31T10:00:00',
      },
    };
    expect(() => graphSeriesPayload(snapshot)).toThrow('clamps');
    expect(googleSeriesPayload(snapshot).recurrence).toHaveLength(1);
  });
  it('does not write a recurrence field into an individual moved exception', () => {
    const snapshot = {
      ...current,
      anchor: {
        ...current.anchor,
        startLocal: '2026-03-07T11:00:00',
        endLocal: '2026-03-07T12:00:00',
      },
    };
    expect(googleSeriesPayload(snapshot, true)).not.toHaveProperty(
      'recurrence'
    );
    expect(graphSeriesPayload(snapshot, true)).not.toHaveProperty('recurrence');
  });
  it('uses a deterministic valid Google event ID for all retries', () => {
    const first = providerSeriesCreatePlan('request', current).steps[0];
    expect(first).toEqual(
      providerSeriesCreatePlan('request', current).steps[0]
    );
    expect(first).toMatchObject({
      kind: 'create',
      key: expect.stringMatching(/^[0-9a-v]{5,1024}$/),
    });
  });
  it('splits future COUNT into trimmed old series and remaining tail, in that order', () => {
    const plan = mutate('future');
    expect(plan.steps.map((step) => step.kind)).toEqual(['trim', 'create']);
    expect(plan.steps[0]).toMatchObject({
      rule: { end: { type: 'until', date: '2026-03-07' } },
    });
    expect(plan.steps[1]).toMatchObject({
      snapshot: {
        rule: { end: { type: 'count', count: 3 } },
        anchor: { startLocal: '2026-03-08T09:00:00' },
      },
    });
  });
  it('maps first-slot future editing to a master update', () => {
    expect(
      mutate('future', 'update', current.anchor.startLocal).steps
    ).toHaveLength(1);
    expect(
      mutate('future', 'update', current.anchor.startLocal).steps[0]
    ).toMatchObject({ kind: 'update', target: 'master' });
  });
  it.each(['this', 'all', 'future'] as const)(
    'deletes %s without creating another series',
    (scope) => {
      expect(
        mutate(scope, 'delete').steps.some((step) => step.kind === 'create')
      ).toBe(false);
    }
  );
  it('retains original slot even when the actual occurrence moves', () => {
    const plan = providerSeriesMutationPlan({
      operationId: 'request',
      binding,
      current,
      scope: 'this',
      action: 'update',
      originalStartLocal: '2026-03-08T09:00:00',
      anchor: {
        ...current.anchor,
        startLocal: '2026-03-12T11:00:00',
        endLocal: '2026-03-12T12:00:00',
      },
    });
    expect(plan.steps[0]).toMatchObject({
      originalStartLocal: '2026-03-08T09:00:00',
      snapshot: { anchor: { startLocal: '2026-03-12T11:00:00' } },
    });
  });
  it('rejects invented or out-of-count occurrence identities', () => {
    expect(() => mutate('this', 'delete', '2026-03-20T09:00:00')).toThrow();
  });
  it('rejects changing a single occurrence generating rule', () => {
    expect(() =>
      providerSeriesMutationPlan({
        operationId: 'request',
        binding,
        current,
        scope: 'this',
        action: 'update',
        originalStartLocal: '2026-03-08T09:00:00',
        rule: current.rule,
      })
    ).toThrow('pattern');
  });
});

describe('durable provider series execution', () => {
  function fixture(completed = 0) {
    const plan = mutate('future');
    const checkpoints = Array.from({ length: completed }, (_, step) => ({
      step,
      result: { eventId: 'master', etag: 'v2' },
    }));
    const store: ProviderSeriesOperationStore = {
      claim: vi.fn().mockResolvedValue({ plan, checkpoints, lease: 'lease' }),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      finalize: vi.fn().mockResolvedValue({ applied: true }),
    };
    const provider = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
      apply: vi.fn().mockResolvedValue({ eventId: 'replacement', etag: 'v3' }),
    };
    return { store, provider };
  }
  it('checkpoints each remote result before the next remote effect and finalization', async () => {
    const { store, provider } = fixture();
    await executeProviderSeriesOperation(store, provider);
    expect(store.checkpoint).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(store.checkpoint).mock.invocationCallOrder[0]
    ).toBeLessThan(provider.apply.mock.invocationCallOrder[1]!);
    expect(
      vi.mocked(store.finalize).mock.invocationCallOrder[0]
    ).toBeGreaterThan(vi.mocked(store.checkpoint).mock.invocationCallOrder[1]!);
  });
  it('resumes after trimming without repeating the durable completed effect', async () => {
    const { store, provider } = fixture(1);
    await executeProviderSeriesOperation(store, provider);
    expect(provider.apply).toHaveBeenCalledTimes(1);
    expect(provider.apply.mock.calls[0]?.[1]).toMatchObject({ kind: 'create' });
  });
  it('does not apply remote effects after all checkpoints are durable', async () => {
    const { store, provider } = fixture(2);
    await executeProviderSeriesOperation(store, provider);
    expect(provider.apply).not.toHaveBeenCalled();
    expect(store.finalize).toHaveBeenCalledTimes(1);
  });
  it('leaves operation recoverable without finalizing if later provider write fails', async () => {
    const { store, provider } = fixture();
    provider.apply.mockRejectedValueOnce(new Error('429'));
    await expect(
      executeProviderSeriesOperation(store, provider)
    ).rejects.toThrow('429');
    expect(store.checkpoint).not.toHaveBeenCalled();
    expect(store.finalize).not.toHaveBeenCalled();
  });
  it('stops before another remote effect if checkpoint persistence fails', async () => {
    const { store, provider } = fixture();
    vi.mocked(store.checkpoint).mockRejectedValueOnce(
      new Error('storage unavailable')
    );
    await expect(
      executeProviderSeriesOperation(store, provider)
    ).rejects.toThrow('storage');
    expect(provider.apply).toHaveBeenCalledTimes(1);
    expect(store.finalize).not.toHaveBeenCalled();
  });
  it('rechecks current permission before every remote step and final publication', async () => {
    const { store, provider } = fixture();
    provider.assertAuthorized
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('access revoked'));
    await expect(
      executeProviderSeriesOperation(store, provider)
    ).rejects.toThrow('revoked');
    expect(provider.apply).not.toHaveBeenCalled();
  });
  it('rejects a sparse or reordered durable checkpoint sequence', async () => {
    const { store, provider } = fixture();
    vi.mocked(store.claim).mockResolvedValue({
      plan: mutate('future'),
      checkpoints: [{ step: 1, result: { eventId: 'x', etag: 'v' } }],
      lease: 'lease',
    });
    await expect(
      executeProviderSeriesOperation(store, provider)
    ).rejects.toThrow('sequence');
    expect(provider.apply).not.toHaveBeenCalled();
  });
});

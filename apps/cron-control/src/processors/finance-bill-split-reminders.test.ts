import { expect, it, vi } from 'vitest';
import { dispatchBillSplitReminders } from './finance-bill-split-reminders';
import type { ProcessorContext } from './types';

function context(enabled: boolean, counters: unknown) {
  const fetch = vi.fn().mockResolvedValue(Response.json(counters));
  const state: ProcessorContext = {
    deadline: 100_000,
    env: {
      SUPABASE_URL: 'https://database.example.test',
      SUPABASE_SECRET_KEY: 'fixture',
    },
    fetch,
    fence: async () => enabled,
    now: () => 0,
    pending: {
      add: vi.fn(),
      list: vi.fn(),
      fail: vi.fn(),
      quarantined: vi.fn(),
      settle: vi.fn(),
    },
    target: {
      secret: 'fixture',
      url: new URL('https://database.example.test'),
    },
    userAgent: 'fixture',
  };
  return { state, fetch };
}

it('stops before a database request when the durable lease fence is closed', async () => {
  const { state, fetch } = context(false, { delivered: 0, canceled: 0 });
  await expect(dispatchBillSplitReminders(state)).resolves.toEqual({
    detail: {},
    outcome: 'stopped',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('dispatches one capped batch and refuses counters exceeding the cap', async () => {
  const admitted = context(true, { delivered: 2, canceled: 16 });
  await expect(dispatchBillSplitReminders(admitted.state)).resolves.toEqual({
    detail: { delivered: 2, canceled: 16 },
    outcome: 'ok',
  });
  expect(admitted.fetch).toHaveBeenCalledExactlyOnceWith(
    new URL(
      'https://database.example.test/rest/v1/rpc/dispatch_finance_bill_split_reminders'
    ),
    expect.objectContaining({ body: '{"p_limit":20}' })
  );
  const excessive = context(true, { delivered: 20, canceled: 1 });
  await expect(dispatchBillSplitReminders(excessive.state)).resolves.toEqual({
    detail: {},
    outcome: 'unknown',
  });
  expect(excessive.fetch).toHaveBeenCalledTimes(1);
});

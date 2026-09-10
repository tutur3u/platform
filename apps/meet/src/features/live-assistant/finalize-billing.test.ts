import { expect, it, vi } from 'vitest';
import type { SavedSession } from '../../../cloudflare/live/session-state';

const mocks = vi.hoisted(() => ({ settle: vi.fn(), report: vi.fn() }));
vi.mock('../../../cloudflare/live/billing', () => ({
  settleLiveBilling: mocks.settle,
}));
vi.mock('../../../cloudflare/live/usage-report', () => ({
  reportLiveUsage: mocks.report,
}));
vi.mock('../../../cloudflare/live/erase-context', () => ({
  eraseEndedLiveContext: async () => {},
}));

import { finalizeSessionBilling } from '../../../cloudflare/live/finalize-billing';

it('retries a failed accounting report without repeating its completed settlement', async () => {
  const saved = { billing: { id: 'bill', sequence: 0 } } as SavedSession;
  mocks.settle.mockResolvedValue({
    id: 'bill',
    sequence: 1,
    settlementComplete: true,
  });
  mocks.report
    .mockRejectedValueOnce(new Error('temporary'))
    .mockResolvedValue(undefined);
  const persist = vi.fn(async () => {}),
    retry = vi.fn(async () => {});
  const finalize = () =>
    finalizeSessionBilling({} as never, saved, persist, retry, {} as never);
  await finalize();
  expect(saved.billingFinalized).not.toBe(true);
  expect(saved.billing?.settlementComplete).toBe(true);
  await finalize();
  expect(mocks.settle).toHaveBeenCalledOnce();
  expect(mocks.report).toHaveBeenCalledTimes(2);
  expect(saved.billingFinalized).toBe(true);
});

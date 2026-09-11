import { afterEach, expect, it, vi } from 'vitest';
import { getSubscriptionInvoiceContext } from './finance';

afterEach(() => vi.restoreAllMocks());

it('aborts a stalled subscription context read so the form can offer retry', async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(controller.signal);
  const fetchMock = vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason)
        );
      })
  );
  const pending = getSubscriptionInvoiceContext(
    'ws-1',
    {
      groupIds: ['group-1'],
      month: '2026-09',
      userId: 'user-1',
    },
    { fetch: fetchMock }
  );
  const assertion = expect(pending).rejects.toThrow('Timed out');
  controller.abort(new Error('Timed out'));
  await assertion;
  expect(timeout).toHaveBeenCalledWith(15_000);
});

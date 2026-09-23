import { afterEach, expect, it, vi } from 'vitest';
import { getSubscriptionPaymentAnalytics } from './finance-subscription-analytics';

afterEach(() => vi.restoreAllMocks());
it('encodes workspace and repeated filters without joining identifiers', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ currencies: [] }), { status: 200 })
    );
  await getSubscriptionPaymentAnalytics(
    'workspace/id',
    {
      year: 2026,
      granularity: 'monthly',
      userIds: ['u1', 'u2'],
      walletIds: ['w1', 'w2'],
    },
    { fetch, baseUrl: 'https://finance.example.com' }
  );
  const [input, init] = fetch.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.pathname).toContain('workspace%2Fid');
  expect(url.searchParams.getAll('userIds')).toEqual(['u1', 'u2']);
  expect(url.searchParams.getAll('walletIds')).toEqual(['w1', 'w2']);
  expect(url.searchParams.get('year')).toBe('2026');
  expect(init.cache).toBe('no-store');
});
it('propagates incomplete report errors instead of returning an empty chart', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ message: 'Incomplete' }), { status: 503 })
    );
  await expect(
    getSubscriptionPaymentAnalytics(
      'ws',
      { year: 2026, granularity: 'yearly' },
      { fetch }
    )
  ).rejects.toThrow();
});
it('bounds stalled reads', async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(controller.signal);
  const fetch = vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason)
        )
      )
  );
  const pending = getSubscriptionPaymentAnalytics(
    'ws',
    { year: 2026, granularity: 'monthly' },
    { fetch }
  );
  const assertion = expect(pending).rejects.toThrow('Timed out');
  controller.abort(new Error('Timed out'));
  await assertion;
  expect(timeout).toHaveBeenCalledWith(60_000);
});

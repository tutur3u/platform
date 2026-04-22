import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSepayBankAccounts } from './sepay-api';

describe('sepay api', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries 429 responses and paginates bank accounts with since_id', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          headers: { 'retry-after': '0' },
          status: 429,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: Array.from({ length: 100 }, (_, index) => ({
              id: String(index + 1),
            })),
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: '101' }],
          }),
          { status: 200 }
        )
      );

    global.fetch = fetchMock;

    const pending = listSepayBankAccounts({ accessToken: 'token' });
    await vi.runAllTimersAsync();
    const accounts = await pending;

    expect(accounts).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const secondCallUrl = new URL(fetchMock.mock.calls[1]?.[0] as string);
    expect(secondCallUrl.searchParams.get('limit')).toBe('100');
    expect(secondCallUrl.searchParams.get('since_id')).toBeNull();

    const thirdCallUrl = new URL(fetchMock.mock.calls[2]?.[0] as string);
    expect(thirdCallUrl.searchParams.get('since_id')).toBe('100');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expireCheckoutReservations: vi.fn(),
  safelyRevalidateWorkspaceStorefronts: vi.fn(),
  revalidateWorkspaceStorefronts: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  expireCheckoutReservations: (...args: unknown[]) =>
    mocks.expireCheckoutReservations(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  revalidateWorkspaceStorefronts: (...args: unknown[]) =>
    mocks.revalidateWorkspaceStorefronts(...args),
  safelyRevalidateWorkspaceStorefronts: (...args: unknown[]) =>
    mocks.safelyRevalidateWorkspaceStorefronts(...args),
}));

vi.mock('@tuturuuu/utils/constants', () => ({ DEV_MODE: false }));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_context: unknown, callback: () => unknown) => callback(),
}));

describe('inventory checkout expiry cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
  });

  it('rejects requests without the configured cron secret', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/cron/inventory/checkout-expiry'
      ) as never
    );

    expect(response.status).toBe(401);
    expect(mocks.expireCheckoutReservations).not.toHaveBeenCalled();
  });

  it('expires reservations in bounded batches until the queue is drained', async () => {
    mocks.expireCheckoutReservations
      .mockResolvedValueOnce(
        Array.from({ length: 1000 }, (_, index) => ({
          checkout_id: `checkout-${index}`,
          ws_id: 'ws-1',
        }))
      )
      .mockResolvedValueOnce([
        { checkout_id: 'checkout-final', ws_id: 'ws-1' },
      ]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/inventory/checkout-expiry', {
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: { batches: 2, expired: 1001 },
    });
    expect(mocks.expireCheckoutReservations).toHaveBeenCalledTimes(2);
    expect(mocks.expireCheckoutReservations).toHaveBeenCalledWith({
      limit: 1000,
      now: expect.any(Date),
    });
  });

  it('returns a sanitized error when cleanup fails', async () => {
    mocks.expireCheckoutReservations.mockRejectedValue(
      new Error('database unavailable')
    );
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/inventory/checkout-expiry', {
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    });
  });

  describe('storefront revalidation for the Cron Control processor', () => {
    const WS = '00000000-0000-4000-8000-000000000001';
    const post = (body: string, authorization = 'Bearer cron-secret') =>
      import('./route').then(({ POST }) =>
        POST(
          new Request('http://localhost/api/cron/inventory/checkout-expiry', {
            body,
            headers: { Authorization: authorization },
            method: 'POST',
          }) as never
        )
      );

    it('requires the cron secret', async () => {
      const response = await post(
        JSON.stringify({ revalidateWorkspaceIds: [WS] }),
        'Bearer wrong'
      );
      expect(response.status).toBe(401);
      expect(mocks.safelyRevalidateWorkspaceStorefronts).not.toHaveBeenCalled();
    });

    it('revalidates each distinct workspace once without expiring checkouts', async () => {
      const response = await post(
        JSON.stringify({ revalidateWorkspaceIds: [WS, WS] })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        revalidated: 1,
        results: [{ wsId: WS, ok: true }],
      });
      expect(mocks.revalidateWorkspaceStorefronts).toHaveBeenCalledTimes(1);
      expect(mocks.revalidateWorkspaceStorefronts).toHaveBeenCalledWith(WS);
      expect(mocks.expireCheckoutReservations).not.toHaveBeenCalled();
    });

    it('reports a failed invalidation and continues with the next workspace', async () => {
      const next = '00000000-0000-4000-8000-000000000002';
      mocks.revalidateWorkspaceStorefronts
        .mockRejectedValueOnce(new Error('invalidation failed'))
        .mockResolvedValueOnce(undefined);
      mocks.safelyRevalidateWorkspaceStorefronts.mockResolvedValue(undefined);
      const response = await post(
        JSON.stringify({ revalidateWorkspaceIds: [WS, next] })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        revalidated: 1,
        results: [
          { wsId: WS, ok: false },
          { wsId: next, ok: true },
        ],
      });
      expect(mocks.revalidateWorkspaceStorefronts).toHaveBeenCalledTimes(2);
      expect(mocks.safelyRevalidateWorkspaceStorefronts).not.toHaveBeenCalled();
    });

    it.each([
      ['malformed JSON', '{'],
      ['a non-array', JSON.stringify({ revalidateWorkspaceIds: WS })],
      ['a non-UUID', JSON.stringify({ revalidateWorkspaceIds: ['../x'] })],
      [
        'too many workspaces',
        JSON.stringify({ revalidateWorkspaceIds: Array(101).fill(WS) }),
      ],
    ])('rejects %s before any work', async (_label, body) => {
      expect((await post(body)).status).toBe(400);
      expect(mocks.safelyRevalidateWorkspaceStorefronts).not.toHaveBeenCalled();
    });

    it('rejects an oversized body', async () => {
      expect((await post(' '.repeat(8_193))).status).toBe(413);
    });
  });
});

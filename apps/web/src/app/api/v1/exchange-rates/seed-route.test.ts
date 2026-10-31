import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ from: vi.fn(), admin: vi.fn() }));
vi.mock('next/server', async (load) => ({
  ...(await load<object>()),
  connection: async () => {},
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, { supabase: { from: f.from } }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: { date: '2026-01-01' }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockImplementation((column: string) =>
    column === 'target_currency'
      ? Promise.resolve({ data: [], error: null })
      : query
  );
  query.limit.mockReturnValue(query);
  f.from.mockReturnValue(query);
  f.admin.mockResolvedValue({
    from: () => ({ upsert: async () => ({ error: null }) }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('seeds rates without sending credentials in an outbound request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ date: '2026-01-01', usd: { vnd: 25000 } }),
        { status: 200 }
      )
    );
  vi.stubGlobal('fetch', fetcher);
  const response = await GET(
    new Request('https://example.test/api/v1/exchange-rates') as never
  );
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
  expect(fetcher.mock.calls[0]?.[1]).toEqual({ next: { revalidate: 0 } });
});

it('logs and handles a seed failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await GET(
    new Request('https://example.test/api/v1/exchange-rates') as never
  );
  expect(response.status).toBe(502);
  expect(log).toHaveBeenCalledWith('Failed to seed exchange rates', {
    status: 502,
  });
});

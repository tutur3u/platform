import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

const BARE_UUID_AVATAR_VALUE = 'bbaf2747-4452-4b56-910d-0b313f49843e';
const SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL =
  'https://yjbjpmwbfimjcdsjxfst.supabase.co/storage/v1/object/public/avatars/bbaf2747-4452-4b56-910d-0b313f49843e';

describe('sanitizePendingInvoiceAvatarRows', () => {
  it('nulls invalid pending invoice avatar values without mutating other fields', async () => {
    const { sanitizePendingInvoiceAvatarRows } = await import('./route');
    expect(
      sanitizePendingInvoiceAvatarRows([
        {
          user_id: 'user-1',
          user_name: 'Anh Vu',
          user_avatar_url: BARE_UUID_AVATAR_VALUE,
          months_owed: '2026-06',
        },
        {
          user_id: 'user-2',
          user_name: 'Bich Ngan',
          user_avatar_url: SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL,
          months_owed: '2026-06',
        },
        {
          user_id: 'user-3',
          user_name: 'Chi Mai',
          user_avatar_url: 'https://example.com/avatar.png',
          months_owed: '2026-06',
        },
      ])
    ).toEqual([
      {
        user_id: 'user-1',
        user_name: 'Anh Vu',
        user_avatar_url: null,
        months_owed: '2026-06',
      },
      {
        user_id: 'user-2',
        user_name: 'Bich Ngan',
        user_avatar_url: SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL,
        months_owed: '2026-06',
      },
      {
        user_id: 'user-3',
        user_name: 'Chi Mai',
        user_avatar_url: 'https://example.com/avatar.png',
        months_owed: '2026-06',
      },
    ]);
  });
});

describe('GET pending invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({ user: {} });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: { containsPermission: () => true },
        sbAdmin: { rpc: mocks.rpc },
      },
    });
  });

  it('uses the authorized service-role client for pending rows and counts', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ user_id: 'user-1', user_avatar_url: null }],
        error: null,
      })
      .mockResolvedValueOnce({ data: 1, error: null });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://finance.test/api/pending?page=1&pageSize=10'),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ user_id: 'user-1', user_avatar_url: null }],
      count: 1,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'get_pending_invoices', {
      p_limit: 10,
      p_offset: 0,
      p_query: undefined,
      p_user_ids: undefined,
      p_ws_id: 'ws-1',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_pending_invoices_count', {
      p_query: undefined,
      p_user_ids: undefined,
      p_ws_id: 'ws-1',
    });
  });

  it('rejects callers without view-invoices permission before any RPC', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: { containsPermission: () => false },
        sbAdmin: { rpc: mocks.rpc },
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://finance.test/api/pending'),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps export filters and offsets consistent for grouped=%s',
    async (grouped) => {
      mocks.rpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: 2050, error: null });
      const { GET } = await import('./route');
      const response = await GET(
        new Request(
          `https://finance.test/api/pending?page=3&pageSize=1000&groupByUser=${grouped}&q=Math&userIds=a&userIds=b`
        ),
        { params: Promise.resolve({ wsId: 'ws-1' }) }
      );
      expect(response.status).toBe(200);
      const rpc = grouped
        ? 'get_pending_invoices_grouped_by_user'
        : 'get_pending_invoices';
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, rpc, {
        p_ws_id: 'ws-1',
        p_limit: 1000,
        p_offset: 2000,
        p_query: 'Math',
        p_user_ids: ['a', 'b'],
      });
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, `${rpc}_count`, {
        p_ws_id: 'ws-1',
        p_query: 'Math',
        p_user_ids: ['a', 'b'],
      });
      // Expose the actual count, even on a short response, for client validation.
      expect(await response.json()).toEqual({ data: [], count: 2050 });
    }
  );

  it.each(['page=0', 'pageSize=0', 'page=1.5', 'groupByUser=invalid'])(
    'rejects invalid pagination: %s',
    async (query) => {
      const { GET } = await import('./route');
      const response = await GET(
        new Request(`https://finance.test/api/pending?${query}`),
        { params: Promise.resolve({ wsId: 'ws-1' }) }
      );
      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['rows', '57014', 504],
    ['rows', 'other', 500],
    ['count', '57014', 504],
    ['count', 'other', 500],
  ] as const)(
    'does not disguise a %s error %s as an empty export',
    async (stage, code, status) => {
      if (stage === 'count')
        mocks.rpc.mockResolvedValueOnce({
          data: [{ user_id: 'student', group_id: 'class' }],
          error: null,
        });
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: 'Database failure' },
      });
      const { GET } = await import('./route');
      const response = await GET(
        new Request('https://finance.test/api/pending'),
        { params: Promise.resolve({ wsId: 'ws-1' }) }
      );
      expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty('data');
    }
  );
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  withoutPermission: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: deps.authorize,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));

const contactId = '78600000-0000-4000-8000-000000000011';
const wsId = '78600000-0000-4000-8000-000000000012';

function read(userId = contactId, rawWsId = wsId) {
  return GET(new Request('https://example.test/billing'), {
    params: Promise.resolve({ wsId: rawWsId, userId }),
  });
}

function query(result: unknown, finish: 'maybeSingle' | 'range') {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    [finish]: vi.fn().mockResolvedValue(result),
  };
}

describe('contact billing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.withoutPermission.mockReturnValue(false);
    deps.authorize.mockResolvedValue({
      context: {
        normalizedWsId: wsId,
        permissions: { withoutPermission: deps.withoutPermission },
        sbAdmin: { from: deps.from, rpc: deps.rpc },
      },
    });
  });

  it.each(['view_invoices', 'view_users_private_info'])(
    'denies callers without %s before looking up the contact',
    async (missing) => {
      deps.withoutPermission.mockImplementation(
        (permission) => permission === missing
      );
      expect((await read()).status).toBe(403);
      expect(deps.from).not.toHaveBeenCalled();
      expect(deps.rpc).not.toHaveBeenCalled();
    }
  );

  it('denies callers who have neither permission', async () => {
    deps.withoutPermission.mockReturnValue(true);
    expect((await read()).status).toBe(403);
    expect(deps.from).not.toHaveBeenCalled();
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('rejects a contact from another workspace before reading financial data', async () => {
    const contacts = query({ data: null, error: null }, 'maybeSingle');
    deps.from.mockReturnValue(contacts);
    const foreign = await read();
    const missingId = '78600000-0000-4000-8000-000000000013';
    const missing = await read(missingId);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(foreign.status);
    expect(await missing.json()).toEqual(await foreign.json());
    expect(contacts.eq.mock.calls).toEqual([
      ['ws_id', wsId],
      ['id', contactId],
      ['ws_id', wsId],
      ['id', missingId],
    ]);
    expect(deps.from.mock.calls).toEqual([
      ['workspace_users'],
      ['workspace_users'],
    ]);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('returns only the contact amounts and fields displayed by the screen', async () => {
    deps.from.mockReturnValueOnce(
      query({ data: { id: contactId }, error: null }, 'maybeSingle')
    );
    const invoices = query(
      {
        count: 1,
        error: null,
        data: [
          {
            id: 'invoice',
            notice: 'November',
            note: null,
            created_at: '2026-11-01T00:00:00Z',
            price: 200,
            total_diff: 2,
            creator: { email: 'creator@example.invalid' },
          },
        ],
      },
      'range'
    );
    deps.from.mockReturnValueOnce(invoices);
    deps.rpc.mockResolvedValueOnce({
      data: [{ user_id: contactId, potential_total: 15 }],
      error: null,
    });

    const response = await read(contactId, 'personal');
    expect(deps.authorize.mock.calls[0]?.[1]).toBe('personal');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(invoices.eq.mock.calls).toEqual([
      ['ws_id', wsId],
      ['customer_id', contactId],
    ]);
    expect(deps.rpc).toHaveBeenCalledWith(
      'get_pending_invoices_grouped_by_user',
      { p_ws_id: wsId, p_user_ids: [contactId], p_limit: 1 }
    );
    expect(await response.json()).toEqual({
      count: 1,
      outstanding: 15,
      data: [
        {
          id: 'invoice',
          notice: 'November',
          note: null,
          created_at: '2026-11-01T00:00:00Z',
          price: 202,
        },
      ],
    });
  });
});

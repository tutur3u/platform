import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  existingInvoiceMaybeSingle: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  getPermissions: vi.fn(),
  adminSupabase: {
    from: vi.fn((table: string) => {
      if (table !== 'finance_invoices') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mocks.existingInvoiceMaybeSingle,
            })),
          })),
        })),
      };
    }),
  },
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: vi.fn(),
  isPersonalWorkspace: vi.fn(),
}));

describe('invoice detail route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPermissions.mockResolvedValue(
      withPermissions(['update_invoices'])
    );
    mocks.getFinanceRouteContext.mockImplementation(async () => ({
      context: {
        normalizedWsId: 'ws-1',
        permissions: await mocks.getPermissions(),
        sbAdmin: mocks.adminSupabase,
        supabase: mocks.adminSupabase,
        user: {
          email: 'agent@example.com',
          id: 'user-1',
        },
      },
    }));
    mocks.existingInvoiceMaybeSingle.mockResolvedValue({
      data: {
        id: 'invoice-1',
        wallet_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    });
  });

  it('does not allow create-only wallet permission to reassign an existing invoice wallet', async () => {
    const { PUT } = await import('./route');

    mocks.getPermissions.mockResolvedValue(
      withPermissions(['update_invoices', 'set_finance_wallets_on_create'])
    );

    const response = await PUT(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/invoice-1',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wallet_id: '22222222-2222-4222-8222-222222222222',
          }),
        }
      ),
      {
        params: Promise.resolve({
          invoiceId: 'invoice-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to change the wallet for invoices',
    });
  });

  it('answers the fee-lock 409 when a pre-filled invoice is blocked from deletion', async () => {
    const { DELETE } = await import('./route');
    const INVOICE = '00000000-0000-4000-8000-0000000fe851';
    const link = { data: { id: 'link-1' }, error: null };
    const linkQuery = {
      eq: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => link),
      select: vi.fn(),
    };
    for (const key of ['eq', 'limit', 'select'] as const)
      linkQuery[key].mockReturnValue(linkQuery);
    const sbAdmin = {
      from: vi.fn(() => linkQuery),
      rpc: vi.fn(async () => ({ data: null, error: { code: '23503' } })),
    };
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['delete_invoices']),
        sbAdmin,
        user: { id: 'user-1' },
      },
    });

    const response = await DELETE(
      new Request('http://localhost/x', { method: 'DELETE' }),
      {
        params: Promise.resolve({ invoiceId: INVOICE, wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe(
      'Hóa đơn này đã gắn với bảng chốt học phí nên không thể xóa. Nếu cần điều chỉnh, vui lòng liên hệ quản trị viên.'
    );
    expect(sbAdmin.from).toHaveBeenCalledWith('fee_lock_invoice_links');
    expect(linkQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    link.data = null as never;
    const other = await DELETE(
      new Request('http://localhost/x', { method: 'DELETE' }),
      {
        params: Promise.resolve({ invoiceId: INVOICE, wsId: 'ws-1' }),
      }
    );
    expect((await other.json()).message).toBe(
      'Invoice has linked records that must be reviewed before deletion'
    );
  });
});

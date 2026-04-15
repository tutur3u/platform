import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  existingInvoiceMaybeSingle: vi.fn(),
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
    mocks.existingInvoiceMaybeSingle.mockResolvedValue({
      data: {
        id: 'invoice-1',
        wallet_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    });
  });

  it('does not allow create-only wallet permission to reassign an existing invoice wallet', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route'
    );

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
});

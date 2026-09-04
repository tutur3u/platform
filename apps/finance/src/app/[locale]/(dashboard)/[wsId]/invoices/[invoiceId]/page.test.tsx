import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessDenied: vi.fn(() => null),
  detailsPage: vi.fn(() => null),
  getFinanceWorkspaceContext: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page', () => ({
  default: mocks.detailsPage,
}));
vi.mock('@/components/invoices/invoice-access-denied', () => ({
  InvoiceAccessDenied: mocks.accessDenied,
}));
vi.mock('@/lib/workspace', () => ({
  getFinanceWorkspaceContext: mocks.getFinanceWorkspaceContext,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import WorkspaceInvoiceDetailsPage from './page';

function contextWithPermission(canViewInvoices: boolean) {
  return {
    currency: 'VND',
    permissions: {
      containsPermission: (permission: string) =>
        ['update_invoices', 'change_finance_wallets'].includes(permission),
      withoutPermission: (permission: string) =>
        permission === 'view_invoices' && !canViewInvoices,
    },
    user: { email: 'member@example.com', id: 'user-1' },
    wsId: 'workspace-resolved',
  };
}

const params = Promise.resolve({
  invoiceId: 'invoice-1',
  locale: 'en',
  wsId: 'workspace-alias',
});

describe('Finance invoice detail access', () => {
  it('shows a permission recovery state instead of hiding the route', async () => {
    const context = contextWithPermission(false);
    mocks.getFinanceWorkspaceContext.mockResolvedValue(context);

    const page = await WorkspaceInvoiceDetailsPage({ params });

    expect(page.type).toBe(mocks.accessDenied);
    expect(page.props.user).toBe(context.user);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('renders the requested invoice with canonical workspace access', async () => {
    mocks.getFinanceWorkspaceContext.mockResolvedValue(
      contextWithPermission(true)
    );

    const page = await WorkspaceInvoiceDetailsPage({ params });
    const child = page.props.children;

    expect(child.type).toBe(mocks.detailsPage);
    expect(child.props).toMatchObject({
      canChangeFinanceWallets: true,
      canUpdateInvoices: true,
      currency: 'VND',
      invoiceId: 'invoice-1',
      locale: 'en',
      wsId: 'workspace-resolved',
    });
  });

  it('keeps unknown or inaccessible workspaces as not found', async () => {
    mocks.getFinanceWorkspaceContext.mockResolvedValue(null);

    await expect(WorkspaceInvoiceDetailsPage({ params })).rejects.toThrow(
      'not-found'
    );
  });
});

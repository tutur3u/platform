import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessDenied: vi.fn(() => null),
  getFinanceWorkspaceContext: vi.fn(),
  invoicesPage: vi.fn(() => null),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/ui/finance/invoices/invoice-page', () => ({
  default: mocks.invoicesPage,
}));
vi.mock('@/components/invoices/invoice-access-denied', () => ({
  InvoiceAccessDenied: mocks.accessDenied,
}));
vi.mock('@/lib/workspace', () => ({
  getFinanceWorkspaceContext: mocks.getFinanceWorkspaceContext,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import WorkspaceInvoicesPage from './page';

function contextWithPermission(canViewInvoices: boolean) {
  return {
    currency: 'USD',
    permissions: {
      containsPermission: (permission: string) =>
        ['create_invoices', 'delete_invoices'].includes(permission),
      withoutPermission: (permission: string) =>
        permission === 'view_invoices' && !canViewInvoices,
    },
    user: { displayName: 'Invited member', id: 'user-1' },
    workspace: { id: 'workspace-1', name: 'Workspace' },
    wsId: 'workspace-1',
  };
}

describe('Finance invoice list access', () => {
  it('shows a permission recovery state instead of a 404', async () => {
    const context = contextWithPermission(false);
    mocks.getFinanceWorkspaceContext.mockResolvedValue(context);

    const page = await WorkspaceInvoicesPage({
      params: Promise.resolve({ wsId: 'workspace-1' }),
      searchParams: Promise.resolve({} as never),
    });

    expect(page.type).toBe(mocks.accessDenied);
    expect(page.props.user).toBe(context.user);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('renders invoices with canonical workspace context and capabilities', async () => {
    const context = contextWithPermission(true);
    mocks.getFinanceWorkspaceContext.mockResolvedValue(context);

    const page = await WorkspaceInvoicesPage({
      params: Promise.resolve({ wsId: 'workspace-alias' }),
      searchParams: Promise.resolve({} as never),
    });
    const child = page.props.children;

    expect(child.type).toBe(mocks.invoicesPage);
    expect(child.props).toMatchObject({
      canCreateInvoices: true,
      canDeleteInvoices: true,
      currency: 'USD',
      userId: 'user-1',
      workspace: context.workspace,
    });
    await expect(child.props.params).resolves.toEqual({
      wsId: 'workspace-1',
    });
  });

  it('keeps unknown or inaccessible workspaces as not found', async () => {
    mocks.getFinanceWorkspaceContext.mockResolvedValue(null);

    await expect(
      WorkspaceInvoicesPage({
        params: Promise.resolve({ wsId: 'missing' }),
        searchParams: Promise.resolve({} as never),
      })
    ).rejects.toThrow('not-found');
  });
});

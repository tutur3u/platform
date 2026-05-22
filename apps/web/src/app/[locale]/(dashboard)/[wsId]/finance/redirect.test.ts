import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  FinancePage: vi.fn(() => null),
  getWebFinanceWorkspaceContext: vi.fn(),
  headers: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(() => ({ auth: 'forwarded' })),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  withForwardedInternalApiAuth: mocks.withForwardedInternalApiAuth,
}));

vi.mock('@tuturuuu/ui/finance/finance-page', () => ({
  default: mocks.FinancePage,
}));

vi.mock('@/lib/finance-workspace-context', () => ({
  getWebFinanceWorkspaceContext: mocks.getWebFinanceWorkspaceContext,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  redirect: mocks.redirect,
}));

describe('web Finance page parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.getWebFinanceWorkspaceContext.mockResolvedValue({
      currency: 'USD',
      permissions: {
        containsPermission: vi.fn(() => true),
        withoutPermission: vi.fn(() => false),
      },
      user: {
        email: 'user@example.com',
        id: 'user-1',
      },
      workspace: {
        id: 'workspace-1',
        personal: false,
      },
      wsId: 'workspace-1',
    });
  });

  it('renders the shared Finance overview inside apps/web with the web finance route prefix', async () => {
    const WorkspaceFinancePage = (await import('./(dashboard)/page')).default;

    const result = await WorkspaceFinancePage({
      params: Promise.resolve({ wsId: 'personal' }),
      searchParams: Promise.resolve({
        view: 'summary',
      }),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.FinancePage);
    expect(result.props).toMatchObject({
      currency: 'USD',
      financePrefix: '/finance',
      internalApiOptions: { auth: 'forwarded' },
      isPersonalWorkspace: false,
      searchParams: {
        view: 'summary',
      },
      wsId: 'workspace-1',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessDenied: vi.fn(() => null),
  context: vi.fn(),
  enabled: vi.fn(),
  feeLockPage: vi.fn(() => null),
}));
vi.mock('@/components/fee-lock/fee-lock-page', () => ({
  FeeLockPage: mocks.feeLockPage,
}));
vi.mock('@/components/invoices/invoice-access-denied', () => ({
  InvoiceAccessDenied: mocks.accessDenied,
}));
vi.mock('@/lib/fee-lock-access', () => ({ isFeeLockEnabled: mocks.enabled }));
vi.mock('@/lib/workspace', () => ({
  getFinanceWorkspaceContext: mocks.context,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import Page from './page';

const WS_ID = '00000000-0000-4000-8000-00000000f1c0';
const render = (month?: string) =>
  Page({
    params: Promise.resolve({ wsId: 'alias' }),
    searchParams: Promise.resolve({ month }),
  });
const setup = (enabled: boolean, canView = true, canExport = true) => {
  mocks.enabled.mockResolvedValue(enabled);
  mocks.context.mockResolvedValue({
    currency: 'VND',
    permissions: {
      withoutPermission: (p: string) =>
        (p === 'view_invoices' && !canView) ||
        (p === 'export_finance_data' && !canExport),
    },
    user: { id: 'user-1' },
    wsId: WS_ID,
  });
};

describe('fee-lock page gating', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a 404 while ENABLE_FEE_LOCK is off or the workspace is unknown', async () => {
    setup(false);
    await expect(render()).rejects.toThrow('not-found');
    expect(mocks.enabled).toHaveBeenCalledWith(WS_ID);
    mocks.context.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('not-found');
  });

  it('needs view_invoices and normalizes the month', async () => {
    setup(true, false);
    expect((await render()).type).toBe(mocks.accessDenied);
    setup(true);
    const page = await render('2026-12');
    expect(page.type).toBe(mocks.feeLockPage);
    expect(page.props).toMatchObject({ initialMonth: '2026-12', wsId: WS_ID });
    expect((await render('2026-13')).props.initialMonth).toMatch(
      /^\d{4}-(0[1-9]|1[0-2])$/
    );
  });

  it('offers the export only with export_finance_data AND view_invoices', async () => {
    setup(true);
    expect((await render()).props.canExport).toBe(true);
    setup(true, true, false);
    const page = await render();
    expect(page.type).toBe(mocks.feeLockPage);
    expect(page.props.canExport).toBe(false);
    // Without view_invoices there is no page at all, so no export either.
    setup(true, false, true);
    expect((await render()).type).toBe(mocks.accessDenied);
    setup(true, false, false);
    expect((await render()).type).toBe(mocks.accessDenied);
  });
});

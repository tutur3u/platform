import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  isFeeLockEnabled: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(async () => undefined),
}));
vi.mock('@tuturuuu/finance-core/fee-lock/access', () => ({
  isFeeLockEnabled: mocks.isFeeLockEnabled,
  feeLockNotFoundResponse: () =>
    new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: vi.fn(async () => null),
}));

const { feeLockErrorResponse, getFeeLockRouteContext } = await import(
  './access'
);
const request = new Request('https://finance.test/api');
const context = (granted: string[]) => ({
  context: {
    normalizedWsId: 'ws-normalized',
    permissions: { containsPermission: (p: string) => granted.includes(p) },
  },
});

describe('getFeeLockRouteContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes through a non-member response before any other check', async () => {
    const denied = new Response(null, { status: 401 });
    mocks.getFinanceRouteContext.mockResolvedValue({ response: denied });
    const access = await getFeeLockRouteContext(request, 'ws', [
      'view_invoices',
    ]);
    expect(access.response).toBe(denied);
    expect(mocks.isFeeLockEnabled).not.toHaveBeenCalled();
  });

  it('answers 403 for a missing permission without reading the flag', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue(context(['view_invoices']));
    const access = await getFeeLockRouteContext(request, 'ws', [
      'view_invoices',
      'create_invoices',
    ]);
    expect(access.response?.status).toBe(403);
    expect(mocks.isFeeLockEnabled).not.toHaveBeenCalled();
  });

  it('answers 404 when ENABLE_FEE_LOCK is off for the normalized workspace', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue(context(['view_invoices']));
    mocks.isFeeLockEnabled.mockResolvedValue(false);
    const access = await getFeeLockRouteContext(request, 'personal', [
      'view_invoices',
    ]);
    expect(access.response?.status).toBe(404);
    expect(mocks.isFeeLockEnabled).toHaveBeenCalledWith('ws-normalized');
  });

  it('returns the context when the member, permission and flag all pass', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue(context(['view_invoices']));
    mocks.isFeeLockEnabled.mockResolvedValue(true);
    const access = await getFeeLockRouteContext(request, 'ws', [
      'view_invoices',
    ]);
    expect(access.context?.normalizedWsId).toBe('ws-normalized');
  });
});

describe('feeLockErrorResponse', () => {
  it('maps numeric overflow (22003) and invalid input to 400', async () => {
    for (const code of ['22003', '22023', '23514']) {
      const response = feeLockErrorResponse({
        code,
        message: 'FEE_LOCK_AMOUNT_OUT_OF_RANGE',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'FEE_LOCK_AMOUNT_OUT_OF_RANGE',
      });
    }
  });

  it('never echoes a raw database message', async () => {
    const overflow = feeLockErrorResponse({
      code: '22003',
      message: 'numeric field overflow',
    });
    expect(await overflow.json()).toMatchObject({
      code: 'FEE_LOCK_INVALID_INPUT',
    });
    const unknown = feeLockErrorResponse({
      code: 'XX000',
      message: 'secret detail',
    });
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await unknown.json())).not.toContain('secret');
    expect(feeLockErrorResponse({ code: 'PT404' }).status).toBe(404);
  });
});

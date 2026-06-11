import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './[accountId]/route';
import { POST as saveCurrentPOST } from './current/route';
import { dynamic, GET } from './route';
import { POST as switchPOST } from './switch/route';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  listWebAccounts: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  removeWebAccount: vi.fn(),
  saveCurrentWebAccount: vi.fn(),
  switchWebAccount: vi.fn(),
  unstable_rethrow: vi.fn(),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: mocks.createAuthDiagnosticCode,
  logAuthDiagnostic: mocks.logAuthDiagnostic,
}));

vi.mock('@/lib/auth/multi-account/vault', () => ({
  listWebAccounts: (...args: Parameters<typeof mocks.listWebAccounts>) =>
    mocks.listWebAccounts(...args),
  removeWebAccount: (...args: Parameters<typeof mocks.removeWebAccount>) =>
    mocks.removeWebAccount(...args),
  saveCurrentWebAccount: (
    ...args: Parameters<typeof mocks.saveCurrentWebAccount>
  ) => mocks.saveCurrentWebAccount(...args),
  switchWebAccount: (...args: Parameters<typeof mocks.switchWebAccount>) =>
    mocks.switchWebAccount(...args),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: mocks.unstable_rethrow,
}));

describe('web multi-account API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-ACC-LIST-ABC123');
    mocks.unstable_rethrow.mockReturnValue(undefined);
    mocks.listWebAccounts.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
    });
    mocks.saveCurrentWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-1',
      accountId: 'user-1',
      success: true,
    });
    mocks.switchWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-2',
      accountId: 'user-2',
      redirectTo: '/en/personal/tasks',
      success: true,
    });
    mocks.removeWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
      success: true,
    });
  });

  it('opts account listing out of static generation', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('lists account summaries', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/v1/auth/accounts')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      activeAccountId: null,
    });
  });

  it('rethrows DYNAMIC_SERVER_USAGE signals before diagnostic logging', async () => {
    const dynamicServerError = Object.assign(
      new Error('Dynamic server usage'),
      {
        digest: 'DYNAMIC_SERVER_USAGE',
      }
    );
    mocks.listWebAccounts.mockRejectedValue(dynamicServerError);
    mocks.unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(
      GET(new NextRequest('http://localhost/api/v1/auth/accounts'))
    ).rejects.toBe(dynamicServerError);

    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(dynamicServerError);
    expect(mocks.createAuthDiagnosticCode).not.toHaveBeenCalled();
    expect(mocks.logAuthDiagnostic).not.toHaveBeenCalled();
  });

  it('logs and returns the existing diagnostic shape for vault failures', async () => {
    const error = new Error('vault failed');
    mocks.listWebAccounts.mockRejectedValue(error);

    const request = new NextRequest('http://localhost/api/v1/auth/accounts');
    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      activeAccountId: null,
      diagnosticCode: 'AUTH-ACC-LIST-ABC123',
      error: 'Failed to load accounts',
    });
    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(error);
    expect(mocks.createAuthDiagnosticCode).toHaveBeenCalledWith('account_list');
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'multi-account',
        code: 'AUTH-ACC-LIST-ABC123',
        error,
        message: 'Failed to load multi-account vault',
        request,
        route: '/api/v1/auth/accounts',
        stage: 'account_list',
      })
    );
  });

  it('saves the current account with a validated body', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/current',
      {
        body: JSON.stringify({
          returnUrl: '/en/personal/tasks',
          route: '/en/personal/tasks',
        }),
        method: 'POST',
      }
    );

    const response = await saveCurrentPOST(request);

    expect(response.status).toBe(200);
    expect(mocks.saveCurrentWebAccount).toHaveBeenCalledWith(request, {
      returnUrl: '/en/personal/tasks',
      route: '/en/personal/tasks',
    });
  });

  it('returns 410 when switching to a missing or expired account fails', async () => {
    mocks.switchWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
      error: 'Account not found',
      success: false,
    });
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/switch',
      {
        body: JSON.stringify({
          accountId: 'user-2',
        }),
        method: 'POST',
      }
    );

    const response = await switchPOST(request);

    expect(response.status).toBe(410);
  });

  it('removes an account by route param', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/user-2',
      {
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ accountId: 'user-2' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.removeWebAccount).toHaveBeenCalledWith(request, 'user-2');
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  saveCurrentWebAccount: vi.fn(),
  switchWebAccount: vi.fn(),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  getReturnUrlKind: () => 'local',
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

vi.mock('@/lib/auth/multi-account/vault', () => ({
  saveCurrentWebAccount: (
    ...args: Parameters<typeof mocks.saveCurrentWebAccount>
  ) => mocks.saveCurrentWebAccount(...args),
  switchWebAccount: (...args: Parameters<typeof mocks.switchWebAccount>) =>
    mocks.switchWebAccount(...args),
  updateCurrentWebAccount: vi.fn(),
}));

describe('multi-account route diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockImplementation((stage: string) =>
      stage === 'account_save'
        ? 'AUTH-ACC-SAVE-ABC123'
        : 'AUTH-ACC-SWITCH-ABC123'
    );
  });

  it('logs and returns a diagnostic code for account-save vault failures', async () => {
    mocks.saveCurrentWebAccount.mockRejectedValue(new Error('vault failed'));

    const { POST } = await import('@/app/api/v1/auth/accounts/current/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/accounts/current', {
        body: JSON.stringify({ route: '/en/personal/tasks' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-ACC-SAVE-ABC123',
      error: 'Failed to save current account',
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH-ACC-SAVE-ABC123',
        route: '/api/v1/auth/accounts/current',
        stage: 'account_save',
      })
    );
  });

  it('logs and returns a visible diagnostic code for account-switch misses', async () => {
    mocks.switchWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
      error: 'Account not found',
      success: false,
    });

    const { POST } = await import('@/app/api/v1/auth/accounts/switch/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/accounts/switch', {
        body: JSON.stringify({
          accountId: 'missing-account',
          currentRoute: '/en/personal/tasks',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      activeAccountId: null,
      diagnosticCode: 'AUTH-ACC-SWITCH-ABC123',
      error: 'Account not found',
      success: false,
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH-ACC-SWITCH-ABC123',
        level: 'warn',
        route: '/api/v1/auth/accounts/switch',
        stage: 'account_switch',
      })
    );
  });
});

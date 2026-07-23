import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeSquareCheckoutStaff } from './square-checkout-access';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

describe('authorizeSquareCheckoutStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { email: 'admin@example.com', id: 'admin-1' },
    });
  });

  it('resolves Storefront app sessions before checking workspace permissions', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'initiate_pos_checkout',
      membershipType: 'MEMBER',
    });
    const request = new Request('https://inventory.test/checkout-options');

    const result = await authorizeSquareCheckoutStaff(request, 'workspace-1');

    expect(result.ok).toBe(true);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: {
        targetApp: ['storefront', 'inventory'],
      },
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'admin@example.com', id: 'admin-1' },
      wsId: 'workspace-1',
    });
  });

  it('accepts an already verified checkout principal', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => true,
      membershipType: 'MEMBER',
    });
    const principal = { email: 'admin@example.com', id: 'admin-1' };

    const result = await authorizeSquareCheckoutStaff(
      new Request('https://inventory.test/checkouts'),
      'workspace-1',
      principal
    );

    expect(result.ok).toBe(true);
    expect(mocks.resolveSessionAuthContext).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: principal,
      wsId: 'workspace-1',
    });
  });

  it('keeps non-staff and guests blocked', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => true,
      membershipType: 'GUEST',
    });

    const result = await authorizeSquareCheckoutStaff(
      new Request('https://inventory.test/checkout-options'),
      'workspace-1'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

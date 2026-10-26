import { vi } from 'vitest';

export const mocks = {
  createAdminClient: vi.fn(),
  createInventoryPolarCheckout: vi.fn(),
  createInventorySquarePosCheckout: vi.fn(),
  createInventorySquareTerminalCheckout: vi.fn(),
  assertInventorySquarePosReady: vi.fn(),
  assertInventorySquareReady: vi.fn(),
  authorizeSquareCheckoutStaff: vi.fn(),
  checkRateLimit: vi.fn(),
  getCheckoutByPublicToken: vi.fn(),
  getPublicStorefront: vi.fn(),
  insert: vi.fn(),
  isInventoryEnabled: vi.fn(),
  markCheckoutProvider: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  revalidatePublicStorefront: vi.fn(),
  resolveInventorySquareTerminalDevice: vi.fn(),
  resolveSquareCheckoutMethod: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  getCheckoutByPublicToken: (...args: unknown[]) =>
    mocks.getCheckoutByPublicToken(...args),
  markCheckoutProvider: (...args: unknown[]) =>
    mocks.markCheckoutProvider(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar', () => ({
  createInventoryPolarCheckout: (...args: unknown[]) =>
    mocks.createInventoryPolarCheckout(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  assertInventorySquarePosReady: (...args: unknown[]) =>
    mocks.assertInventorySquarePosReady(...args),
  assertInventorySquareReady: (...args: unknown[]) =>
    mocks.assertInventorySquareReady(...args),
  createInventorySquarePosCheckout: (...args: unknown[]) =>
    mocks.createInventorySquarePosCheckout(...args),
  createInventorySquareTerminalCheckout: (...args: unknown[]) =>
    mocks.createInventorySquareTerminalCheckout(...args),
  resolveInventorySquareTerminalDevice: (...args: unknown[]) =>
    mocks.resolveInventorySquareTerminalDevice(...args),
}));

vi.mock('@/constants/common', () => ({
  INVENTORY_APP_URL: 'https://inventory.tuturuuu.com',
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
  revalidatePublicStorefront: (...args: unknown[]) =>
    mocks.revalidatePublicStorefront(...args),
}));

vi.mock('@tuturuuu/inventory-core/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

vi.mock('@/lib/square-checkout-access', () => ({
  authorizeSquareCheckoutStaff: (...args: unknown[]) =>
    mocks.authorizeSquareCheckoutStaff(...args),
}));

vi.mock('@/lib/square-checkout-method', () => ({
  resolveSquareCheckoutMethod: (...args: unknown[]) =>
    mocks.resolveSquareCheckoutMethod(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { error: vi.fn() },
}));

export function resetCheckoutMocks() {
  vi.clearAllMocks();
  mocks.schema.mockReturnValue({
    from: () => ({ insert: mocks.insert }),
    rpc: mocks.rpc,
  });
  mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  mocks.getPublicStorefront.mockResolvedValue({
    listings: [],
    storefront: {
      analyticsEnabled: true,
      checkoutMode: 'polar',
      id: 'storefront-1',
      visibility: 'public',
      wsId: 'ws-1',
    },
  });
  mocks.isInventoryEnabled.mockResolvedValue(true);
  mocks.resolveSessionAuthContext.mockResolvedValue({
    ok: true,
    supabase: {},
    user: { id: 'user-1' },
  });
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  mocks.rpc.mockResolvedValue({
    data: { publicToken: 'public-token' },
    error: null,
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.assertInventorySquareReady.mockResolvedValue({
    readiness: { issues: [], ready: true },
  });
  mocks.assertInventorySquarePosReady.mockResolvedValue({
    posReadiness: { issues: [], ready: true },
  });
  mocks.authorizeSquareCheckoutStaff.mockResolvedValue({ ok: true });
  mocks.resolveSquareCheckoutMethod.mockImplementation(
    ({ configuredCheckoutMode }: { configuredCheckoutMode: string }) =>
      Promise.resolve({
        checkoutMode: configuredCheckoutMode,
        fallbackApplied: false,
        terminalRouting: null,
      })
  );
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} });
  mocks.resolveInventorySquareTerminalDevice.mockResolvedValue(
    'terminal-device-1'
  );
  mocks.markCheckoutProvider.mockResolvedValue(undefined);
  mocks.createInventorySquareTerminalCheckout.mockResolvedValue({
    checkout: {
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      id: 'checkout-1',
      lines: [],
      publicToken: 'public-token',
      squareStatus: 'pending',
      squareTerminalCheckoutId: 'terminal-checkout-1',
      totalAmount: 2500,
      wsId: 'ws-1',
    },
    squareCheckout: {
      id: 'terminal-checkout-1',
      status: 'PENDING',
    },
  });
  mocks.createInventorySquarePosCheckout.mockResolvedValue({
    checkout: {
      id: 'checkout-1',
      publicToken: 'public-token',
      squareStatus: 'pending',
      totalAmount: 2500,
      wsId: 'ws-1',
    },
    launch: {
      androidUrl: 'intent:#Intent;end',
      callbackUrl:
        'https://inventory.tuturuuu.com/api/v1/inventory/square/pos/callback',
      fallbackUrl:
        'http://storefront.tuturuuu.localhost/shop/orders/public-token',
      iosUrl: 'square-commerce-v1://payment/create?data=test',
    },
  });
  mocks.getCheckoutByPublicToken.mockResolvedValue({
    customerEmail: 'buyer@example.com',
    customerName: 'Buyer',
    id: 'checkout-1',
    lines: [],
    publicToken: 'public-token',
    totalAmount: 2500,
    wsId: 'ws-1',
  });
}

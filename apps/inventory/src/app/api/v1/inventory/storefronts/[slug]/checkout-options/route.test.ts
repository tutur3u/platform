import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeSquareCheckoutStaff: vi.fn(),
  getPublicStorefront: vi.fn(),
  isInventoryEnabled: vi.fn(),
  resolveSquareCheckoutMethod: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
}));

vi.mock('@/lib/square-checkout-access', () => ({
  authorizeSquareCheckoutStaff: (...args: unknown[]) =>
    mocks.authorizeSquareCheckoutStaff(...args),
}));

vi.mock('@/lib/square-checkout-method', () => ({
  resolveSquareCheckoutMethod: (...args: unknown[]) =>
    mocks.resolveSquareCheckoutMethod(...args),
}));

describe('Square checkout options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({ ok: true });
    mocks.resolveSquareCheckoutMethod.mockImplementation(
      ({ configuredCheckoutMode }: { configuredCheckoutMode: string }) =>
        Promise.resolve(
          configuredCheckoutMode === 'square_pos'
            ? {
                checkoutMode: 'square_pos',
                fallbackApplied: false,
                terminalRouting: null,
              }
            : {
                checkoutMode: 'square_terminal',
                fallbackApplied: false,
                terminalRouting: {
                  defaultDeviceId: 'terminal-front',
                  devices: [
                    {
                      code: 'code-1',
                      id: 'terminal-front',
                      locationId: 'location-1',
                      name: 'Front counter',
                      pairedAt: '2026-07-22T00:00:00.000Z',
                      productType: 'TERMINAL_API',
                      status: 'PAIRED',
                      updatedAt: '2026-07-22T00:00:00.000Z',
                    },
                  ],
                  environment: 'production',
                  locationId: 'location-1',
                },
              }
        )
    );
  });

  it('lists eligible terminals only after staff authorization', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_terminal',
        wsId: 'workspace-1',
      },
    });

    const response = await GET(new Request('http://test.local/options'), {
      params: Promise.resolve({ slug: 'event-store' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkoutMode: 'square_terminal',
      defaultDeviceId: 'terminal-front',
      devices: [
        expect.objectContaining({
          id: 'terminal-front',
          name: 'Front counter',
        }),
      ],
      routing: 'selected_terminal',
      staffAuthorized: true,
    });
    expect(mocks.authorizeSquareCheckoutStaff).toHaveBeenCalledWith(
      expect.any(Request),
      'workspace-1'
    );
  });

  it('returns the staff authorization response without exposing devices', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_terminal',
        wsId: 'workspace-1',
      },
    });
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({
      ok: false,
      response: Response.json(
        { code: 'POS_STAFF_ACCESS_REQUIRED' },
        { status: 403 }
      ),
    });

    const response = await GET(new Request('http://test.local/options'), {
      params: Promise.resolve({ slug: 'event-store' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.resolveSquareCheckoutMethod).not.toHaveBeenCalled();
  });

  it('describes Square POS App as a same-device handoff', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_pos',
        wsId: 'workspace-1',
      },
    });

    const response = await GET(new Request('http://test.local/options'), {
      params: Promise.resolve({ slug: 'event-store' }),
    });

    await expect(response.json()).resolves.toEqual({
      checkoutMode: 'square_pos',
      configuredCheckoutMode: 'square_pos',
      defaultDeviceId: null,
      devices: [],
      fallbackApplied: false,
      routing: 'current_device',
      staffAuthorized: true,
    });
  });

  it('provides the configured sandbox terminal when Square has no device list', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_terminal',
        wsId: 'workspace-1',
      },
    });
    mocks.resolveSquareCheckoutMethod.mockResolvedValue({
      checkoutMode: 'square_terminal',
      fallbackApplied: false,
      terminalRouting: {
        defaultDeviceId: 'sandbox-terminal',
        devices: [],
        environment: 'sandbox',
        locationId: 'sandbox-location',
      },
    });

    const response = await GET(new Request('http://test.local/options'), {
      params: Promise.resolve({ slug: 'event-store' }),
    });
    const body = await response.json();

    expect(body.devices).toEqual([
      expect.objectContaining({
        id: 'sandbox-terminal',
        name: 'Square Sandbox Terminal',
        status: 'SANDBOX',
      }),
    ]);
  });

  it('uses ready same-device POS when no production Terminal is routable', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_terminal',
        wsId: 'workspace-1',
      },
    });
    mocks.resolveSquareCheckoutMethod.mockResolvedValue({
      checkoutMode: 'square_pos',
      fallbackApplied: true,
      terminalRouting: {
        defaultDeviceId: null,
        devices: [],
        environment: 'production',
        locationId: 'location-1',
      },
    });

    const response = await GET(new Request('http://test.local/options'), {
      params: Promise.resolve({ slug: 'event-store' }),
    });

    await expect(response.json()).resolves.toEqual({
      checkoutMode: 'square_pos',
      configuredCheckoutMode: 'square_terminal',
      defaultDeviceId: null,
      devices: [],
      fallbackApplied: true,
      routing: 'current_device',
      staffAuthorized: true,
    });
  });
});

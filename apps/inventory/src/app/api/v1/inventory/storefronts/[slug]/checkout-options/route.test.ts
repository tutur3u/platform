import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeSquareCheckoutStaff: vi.fn(),
  getInventorySquareCheckoutRouting: vi.fn(),
  getPublicStorefront: vi.fn(),
  isInventoryEnabled: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  getInventorySquareCheckoutRouting: (...args: unknown[]) =>
    mocks.getInventorySquareCheckoutRouting(...args),
}));

vi.mock('@/lib/square-checkout-access', () => ({
  authorizeSquareCheckoutStaff: (...args: unknown[]) =>
    mocks.authorizeSquareCheckoutStaff(...args),
}));

describe('Square checkout options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({ ok: true });
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
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
    });
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
    expect(mocks.getInventorySquareCheckoutRouting).not.toHaveBeenCalled();
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
      defaultDeviceId: null,
      devices: [],
      routing: 'current_device',
      staffAuthorized: true,
    });
    expect(mocks.getInventorySquareCheckoutRouting).not.toHaveBeenCalled();
  });

  it('provides the configured sandbox terminal when Square has no device list', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'square_terminal',
        wsId: 'workspace-1',
      },
    });
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
      defaultDeviceId: 'sandbox-terminal',
      devices: [],
      environment: 'sandbox',
      locationId: 'sandbox-location',
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
});

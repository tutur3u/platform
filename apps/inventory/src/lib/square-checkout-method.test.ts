import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSquareCheckoutMethod } from './square-checkout-method';

const mocks = vi.hoisted(() => ({
  getInventorySquareCheckoutRouting: vi.fn(),
  getInventorySquareSettings: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  getInventorySquareCheckoutRouting: (...args: unknown[]) =>
    mocks.getInventorySquareCheckoutRouting(...args),
  getInventorySquareSettings: (...args: unknown[]) =>
    mocks.getInventorySquareSettings(...args),
}));

describe('resolveSquareCheckoutMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInventorySquareSettings.mockResolvedValue({
      posReadiness: { issues: [], ready: true },
    });
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
      defaultDeviceId: 'terminal-front',
      devices: [{ id: 'terminal-front' }],
      environment: 'production',
      locationId: 'location-1',
    });
  });

  it('keeps a configured routed Terminal when one is available', async () => {
    await expect(
      resolveSquareCheckoutMethod({
        configuredCheckoutMode: 'square_terminal',
        wsId: 'workspace-1',
      })
    ).resolves.toMatchObject({
      checkoutMode: 'square_terminal',
      fallbackApplied: false,
    });
  });

  it('falls back to ready same-device POS when no routed Terminal exists', async () => {
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
      defaultDeviceId: null,
      devices: [],
      environment: 'production',
      locationId: 'location-1',
    });

    await expect(
      resolveSquareCheckoutMethod({
        configuredCheckoutMode: 'square_terminal',
        wsId: 'workspace-1',
      })
    ).resolves.toMatchObject({
      checkoutMode: 'square_pos',
      fallbackApplied: true,
    });
  });

  it('does not fall back when same-device POS is not ready', async () => {
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
      defaultDeviceId: null,
      devices: [],
      environment: 'production',
      locationId: 'location-1',
    });
    mocks.getInventorySquareSettings.mockResolvedValue({
      posReadiness: { issues: ['connection_missing'], ready: false },
    });

    await expect(
      resolveSquareCheckoutMethod({
        configuredCheckoutMode: 'square_terminal',
        wsId: 'workspace-1',
      })
    ).resolves.toMatchObject({
      checkoutMode: 'square_terminal',
      fallbackApplied: false,
    });
  });

  it('preserves a configured sandbox default Terminal', async () => {
    mocks.getInventorySquareCheckoutRouting.mockResolvedValue({
      defaultDeviceId: 'sandbox-terminal',
      devices: [],
      environment: 'sandbox',
      locationId: 'sandbox-location',
    });

    await expect(
      resolveSquareCheckoutMethod({
        configuredCheckoutMode: 'square_terminal',
        wsId: 'workspace-1',
      })
    ).resolves.toMatchObject({
      checkoutMode: 'square_terminal',
      fallbackApplied: false,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => {
  class InventoryPolarWorkspaceMismatchError extends Error {
    actualWsId: string;
    expectedWsId: string;

    constructor({
      actualWsId,
      expectedWsId,
    }: {
      actualWsId: string;
      expectedWsId: string;
    }) {
      super('Inventory Polar webhook workspace mismatch');
      this.actualWsId = actualWsId;
      this.expectedWsId = expectedWsId;
    }
  }

  class WebhookVerificationError extends Error {}

  return {
    getInventoryPolarWebhookSecret: vi.fn(),
    InventoryPolarWorkspaceMismatchError,
    serverLoggerError: vi.fn(),
    serverLoggerWarn: vi.fn(),
    syncInventoryPolarCheckout: vi.fn(),
    syncInventoryPolarOrder: vi.fn(),
    validateEvent: vi.fn(),
    WebhookVerificationError,
    applyPolarProductToInventory: vi.fn(),
  };
});

const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('@tuturuuu/payment/polar', () => ({
  validateEvent: (...args: unknown[]) => mocks.validateEvent(...args),
  WebhookVerificationError: mocks.WebhookVerificationError,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
    warn: (...args: unknown[]) => mocks.serverLoggerWarn(...args),
  },
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar', () => ({
  getInventoryPolarWebhookSecret: (...args: unknown[]) =>
    mocks.getInventoryPolarWebhookSecret(...args),
  InventoryPolarWorkspaceMismatchError:
    mocks.InventoryPolarWorkspaceMismatchError,
  syncInventoryPolarCheckout: (...args: unknown[]) =>
    mocks.syncInventoryPolarCheckout(...args),
  syncInventoryPolarOrder: (...args: unknown[]) =>
    mocks.syncInventoryPolarOrder(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar-product-sync', () => ({
  applyPolarProductToInventory: (...args: unknown[]) =>
    mocks.applyPolarProductToInventory(...args),
}));

describe('inventory Polar webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInventoryPolarWebhookSecret.mockResolvedValue('whsec_verified');
    mocks.syncInventoryPolarCheckout.mockResolvedValue(true);
    mocks.syncInventoryPolarOrder.mockResolvedValue(true);
    mocks.applyPolarProductToInventory.mockResolvedValue(true);
  });

  it('passes the verified path workspace to inventory order handlers', async () => {
    const order = {
      id: 'order-1',
      metadata: {
        checkoutId: 'checkout-1',
        kind: 'inventory_checkout',
        wsId: 'verified-ws',
      },
      status: 'paid',
    };
    mocks.validateEvent.mockReturnValue({ data: order, type: 'order.paid' });

    const response = await POST(
      new Request('https://example.com/api/v1/inventory/polar/webhook/ws', {
        body: '{"type":"order.paid"}',
        headers: { 'webhook-signature': 'sig' },
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'verified-ws' }) }
    );

    await expect(response.json()).resolves.toEqual({ received: true });
    expect(response.status).toBe(200);
    expect(mocks.getInventoryPolarWebhookSecret).toHaveBeenCalledWith(
      'verified-ws',
      'production'
    );
    expect(mocks.validateEvent).toHaveBeenCalledWith(
      '{"type":"order.paid"}',
      expect.objectContaining({ 'webhook-signature': 'sig' }),
      'whsec_verified'
    );
    expect(mocks.syncInventoryPolarOrder).toHaveBeenCalledWith(
      order,
      'verified-ws'
    );
  });

  it('rejects inventory events whose metadata workspace differs from the verified path workspace', async () => {
    const order = {
      id: 'order-1',
      metadata: {
        checkoutId: 'checkout-1',
        kind: 'inventory_checkout',
        wsId: 'victim-ws',
      },
      status: 'paid',
    };
    mocks.validateEvent.mockReturnValue({ data: order, type: 'order.paid' });
    mocks.syncInventoryPolarOrder.mockRejectedValue(
      new mocks.InventoryPolarWorkspaceMismatchError({
        actualWsId: 'victim-ws',
        expectedWsId: 'attacker-ws',
      })
    );

    const response = await POST(
      new Request(
        'https://example.com/api/v1/inventory/polar/webhook/attacker-ws',
        {
          body: '{"type":"order.paid"}',
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ wsId: 'attacker-ws' }) }
    );

    await expect(response.json()).resolves.toEqual({
      message: 'Webhook workspace mismatch',
    });
    expect(response.status).toBe(403);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Rejected inventory Polar webhook workspace mismatch',
      expect.objectContaining({
        actualWsId: 'victim-ws',
        expectedWsId: 'attacker-ws',
        verifiedWsId: 'attacker-ws',
      })
    );
    expect(mocks.syncInventoryPolarCheckout).not.toHaveBeenCalled();
    expect(mocks.applyPolarProductToInventory).not.toHaveBeenCalled();
  });
});

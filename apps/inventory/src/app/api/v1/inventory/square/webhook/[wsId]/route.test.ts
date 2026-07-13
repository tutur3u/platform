import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class SquareWebhookSignatureError extends Error {
    constructor() {
      super('Square webhook signature verification failed');
      this.name = 'SquareWebhookSignatureError';
    }
  }

  return {
    processInventorySquareWebhook: vi.fn(),
    serverError: vi.fn(),
    SquareWebhookSignatureError,
    syncInventorySquareCatalog: vi.fn(),
    waitUntil: vi.fn(),
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  processInventorySquareWebhook: (
    ...args: Parameters<typeof mocks.processInventorySquareWebhook>
  ) => mocks.processInventorySquareWebhook(...args),
  SquareWebhookSignatureError: mocks.SquareWebhookSignatureError,
  syncInventorySquareCatalog: (
    ...args: Parameters<typeof mocks.syncInventorySquareCatalog>
  ) => mocks.syncInventorySquareCatalog(...args),
}));

vi.mock('next/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('next/server')>();
  return {
    ...original,
    after: (callback: () => unknown) => mocks.waitUntil(callback),
  };
});

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

describe('inventory Square webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.processInventorySquareWebhook.mockResolvedValue({
      environment: 'sandbox',
      eventType: 'payment.updated',
    });
    mocks.syncInventorySquareCatalog.mockResolvedValue({ conflicts: 0 });
  });

  it('passes raw body and Square signature header into webhook processing', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'https://web.example.com/api/v1/inventory/square/webhook/workspace-1',
        {
          body: '{"type":"payment.updated"}',
          headers: {
            'x-square-hmacsha256-signature': 'square-signature',
          },
          method: 'POST',
        }
      ),
      params()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      environment: 'sandbox',
      eventType: 'payment.updated',
      received: true,
    });
    expect(mocks.processInventorySquareWebhook).toHaveBeenCalledWith({
      rawBody: '{"type":"payment.updated"}',
      requestUrl:
        'https://web.example.com/api/v1/inventory/square/webhook/workspace-1',
      signature: 'square-signature',
      wsId: 'workspace-1',
    });
  });

  it('returns 401 for invalid Square webhook signatures', async () => {
    mocks.processInventorySquareWebhook.mockRejectedValue(
      new mocks.SquareWebhookSignatureError()
    );

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'https://web.example.com/api/v1/inventory/square/webhook/workspace-1',
        {
          body: '{"type":"payment.updated"}',
          method: 'POST',
        }
      ),
      params()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Webhook signature verification failed',
    });
  });

  it.each([
    'catalog.version.updated',
    'inventory.count.updated',
  ])('defers a safe Square-to-Tuturuuu sync for %s', async (eventType) => {
    mocks.processInventorySquareWebhook.mockResolvedValue({
      environment: 'production',
      eventType,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'https://web.example.com/api/v1/inventory/square/webhook/workspace-1',
        { body: JSON.stringify({ type: eventType }), method: 'POST' }
      ),
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.waitUntil).toHaveBeenCalledOnce();
    const callback = mocks.waitUntil.mock.calls[0]?.[0];
    await callback?.();
    expect(mocks.syncInventorySquareCatalog).toHaveBeenCalledWith({
      direction: 'from_square',
      userId: null,
      wsId: 'workspace-1',
    });
  });

  it('does not schedule a catalog sync for payment events', async () => {
    const { POST } = await import('./route');
    await POST(
      new Request(
        'https://web.example.com/api/v1/inventory/square/webhook/workspace-1',
        { body: '{"type":"payment.updated"}', method: 'POST' }
      ),
      params()
    );
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });
});

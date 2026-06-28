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
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@/lib/inventory/commerce/square', () => ({
  processInventorySquareWebhook: (
    ...args: Parameters<typeof mocks.processInventorySquareWebhook>
  ) => mocks.processInventorySquareWebhook(...args),
  SquareWebhookSignatureError: mocks.SquareWebhookSignatureError,
}));

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
});

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  processInventorySquareWebhook,
  SquareWebhookSignatureError,
  verifySquareWebhookSignature,
} from './webhooks';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getInventorySquareWebhookSecrets: vi.fn(),
  syncInventorySquarePayment: vi.fn(),
  syncInventorySquareTerminalCheckout: vi.fn(),
}));

vi.mock('./connection-store', () => ({
  getInventorySquareWebhookSecrets: (
    ...args: Parameters<typeof mocks.getInventorySquareWebhookSecrets>
  ) => mocks.getInventorySquareWebhookSecrets(...args),
}));

vi.mock('./terminal', () => ({
  syncInventorySquarePayment: (
    ...args: Parameters<typeof mocks.syncInventorySquarePayment>
  ) => mocks.syncInventorySquarePayment(...args),
  syncInventorySquareTerminalCheckout: (
    ...args: Parameters<typeof mocks.syncInventorySquareTerminalCheckout>
  ) => mocks.syncInventorySquareTerminalCheckout(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: vi.fn(),
  },
}));

function sign({
  notificationUrl,
  rawBody,
  signatureKey,
}: {
  notificationUrl: string;
  rawBody: string;
  signatureKey: string;
}) {
  return createHmac('sha256', signatureKey)
    .update(`${notificationUrl}${rawBody}`)
    .digest('base64');
}

describe('Square webhook verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInventorySquareWebhookSecrets.mockResolvedValue([
      { environment: 'sandbox', secret: 'sq-webhook-secret' },
    ]);
    mocks.syncInventorySquarePayment.mockResolvedValue(true);
    mocks.syncInventorySquareTerminalCheckout.mockResolvedValue(true);
  });

  it('validates Square HMAC signatures against the exact notification URL and raw body', () => {
    const rawBody = '{"type":"payment.updated"}';
    const notificationUrl =
      'https://web.example.com/api/v1/inventory/square/webhook/ws-1';
    const signature = sign({
      notificationUrl,
      rawBody,
      signatureKey: 'sq-webhook-secret',
    });

    expect(
      verifySquareWebhookSignature({
        notificationUrl,
        rawBody,
        signature,
        signatureKey: 'sq-webhook-secret',
      })
    ).toBe(true);
    expect(
      verifySquareWebhookSignature({
        notificationUrl: `${notificationUrl}/different`,
        rawBody,
        signature,
        signatureKey: 'sq-webhook-secret',
      })
    ).toBe(false);
  });

  it('rejects invalid signatures before parsing or dispatching the event', async () => {
    await expect(
      processInventorySquareWebhook({
        rawBody: '{not-json',
        requestUrl:
          'https://web.example.com/api/v1/inventory/square/webhook/ws-1',
        signature: 'invalid',
        wsId: 'ws-1',
      })
    ).rejects.toBeInstanceOf(SquareWebhookSignatureError);

    expect(mocks.syncInventorySquarePayment).not.toHaveBeenCalled();
    expect(mocks.syncInventorySquareTerminalCheckout).not.toHaveBeenCalled();
  });

  it('dispatches verified payment events to Square payment sync', async () => {
    const rawBody = JSON.stringify({
      data: {
        object: {
          payment: {
            id: 'payment-1',
            order_id: 'order-1',
            status: 'COMPLETED',
          },
        },
      },
      type: 'payment.updated',
    });
    const requestUrl =
      'https://web.example.com/api/v1/inventory/square/webhook/ws-1';

    await expect(
      processInventorySquareWebhook({
        rawBody,
        requestUrl,
        signature: sign({
          notificationUrl: requestUrl,
          rawBody,
          signatureKey: 'sq-webhook-secret',
        }),
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      environment: 'sandbox',
      eventType: 'payment.updated',
    });

    expect(mocks.getInventorySquareWebhookSecrets).toHaveBeenCalledWith('ws-1');
    expect(mocks.syncInventorySquarePayment).toHaveBeenCalledWith({
      id: 'payment-1',
      order_id: 'order-1',
      status: 'COMPLETED',
    });
  });
});

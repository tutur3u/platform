import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  processInventorySquareWebhook,
  SquareWebhookSignatureError,
  verifySquareWebhookSignature,
} from './webhooks';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getInventorySquareWebhookSecrets: vi.fn(),
  markConnectionRevoked: vi.fn(),
  markConnectionsRevokedByMerchantId: vi.fn(),
  syncInventorySquareDeviceCodePaired: vi.fn(),
  syncInventorySquarePayment: vi.fn(),
  syncInventorySquareTerminalCheckout: vi.fn(),
}));

vi.mock('./connection-store', () => ({
  getInventorySquareWebhookSecrets: (
    ...args: Parameters<typeof mocks.getInventorySquareWebhookSecrets>
  ) => mocks.getInventorySquareWebhookSecrets(...args),
  markConnectionRevoked: (
    ...args: Parameters<typeof mocks.markConnectionRevoked>
  ) => mocks.markConnectionRevoked(...args),
  markConnectionsRevokedByMerchantId: (
    ...args: Parameters<typeof mocks.markConnectionsRevokedByMerchantId>
  ) => mocks.markConnectionsRevokedByMerchantId(...args),
}));

vi.mock('./devices', () => ({
  syncInventorySquareDeviceCodePaired: (
    ...args: Parameters<typeof mocks.syncInventorySquareDeviceCodePaired>
  ) => mocks.syncInventorySquareDeviceCodePaired(...args),
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInventorySquareWebhookSecrets.mockResolvedValue([
      { environment: 'sandbox', secret: 'sq-webhook-secret' },
    ]);
    mocks.markConnectionRevoked.mockResolvedValue(undefined);
    mocks.markConnectionsRevokedByMerchantId.mockResolvedValue(undefined);
    mocks.syncInventorySquareDeviceCodePaired.mockResolvedValue(true);
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
      event_id: 'event-payment-1',
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
    expect(mocks.syncInventorySquarePayment).toHaveBeenCalledWith(
      {
        id: 'payment-1',
        order_id: 'order-1',
        status: 'COMPLETED',
      },
      { eventId: 'event-payment-1' }
    );
  });

  it('dispatches verified device pairing events to the workspace device cache', async () => {
    const rawBody = JSON.stringify({
      data: {
        object: {
          device_code: {
            code: 'PAIRME',
            device_id: 'device-1',
            id: 'device-code-1',
            location_id: 'location-1',
            product_type: 'TERMINAL_API',
            status: 'PAIRED',
          },
        },
      },
      event_id: 'event-device-1',
      type: 'device.code.paired',
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
      eventType: 'device.code.paired',
    });

    expect(mocks.syncInventorySquareDeviceCodePaired).toHaveBeenCalledWith({
      deviceCode: {
        code: 'PAIRME',
        device_id: 'device-1',
        id: 'device-code-1',
        location_id: 'location-1',
        product_type: 'TERMINAL_API',
        status: 'PAIRED',
      },
      environment: 'sandbox',
      wsId: 'ws-1',
    });
  });

  it('ignores signed Square events that do not include an event object', async () => {
    const rawBody = JSON.stringify({
      data: { object: {} },
      event_id: 'event-empty-1',
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

    expect(mocks.syncInventorySquarePayment).not.toHaveBeenCalled();
  });

  it('marks verified OAuth revocation events as revoked for the workspace connection', async () => {
    const rawBody = JSON.stringify({
      event_id: 'event-revoked-1',
      merchant_id: 'merchant-1',
      type: 'oauth.authorization.revoked',
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
      eventType: 'oauth.authorization.revoked',
    });

    expect(mocks.markConnectionRevoked).toHaveBeenCalledWith({
      environment: 'sandbox',
      merchantId: 'merchant-1',
      wsId: 'ws-1',
    });
  });

  it('marks global OAuth revocation events as revoked by merchant id', async () => {
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', 'global-square-secret');
    const rawBody = JSON.stringify({
      event_id: 'event-revoked-2',
      merchant_id: 'merchant-2',
      type: 'oauth.authorization.revoked',
    });
    const requestUrl =
      'https://web.example.com/api/v1/inventory/square/webhook';

    await expect(
      processInventorySquareWebhook({
        rawBody,
        requestUrl,
        signature: sign({
          notificationUrl: requestUrl,
          rawBody,
          signatureKey: 'global-square-secret',
        }),
      })
    ).resolves.toEqual({
      environment: 'production',
      eventType: 'oauth.authorization.revoked',
    });

    expect(mocks.markConnectionsRevokedByMerchantId).toHaveBeenCalledWith({
      environment: 'production',
      merchantId: 'merchant-2',
    });
  });
});

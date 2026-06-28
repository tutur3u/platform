import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getInventorySquareWebhookSecrets,
  markConnectionRevoked,
  markConnectionsRevokedByMerchantId,
} from './connection-store';
import { syncInventorySquareDeviceCodePaired } from './devices';
import {
  syncInventorySquarePayment,
  syncInventorySquareTerminalCheckout,
} from './terminal';
import type {
  SquareApiDeviceCode,
  SquareApiPayment,
  SquareApiTerminalCheckout,
  SquareEnvironment,
} from './types';

type SquareWebhookEvent = {
  data?: {
    object?: Record<string, unknown>;
  };
  event_id?: string;
  merchant_id?: string;
  type?: string;
};

export class SquareWebhookSignatureError extends Error {
  constructor() {
    super('Square webhook signature verification failed');
    this.name = 'SquareWebhookSignatureError';
  }
}

export function verifySquareWebhookSignature({
  notificationUrl,
  rawBody,
  signature,
  signatureKey,
}: {
  notificationUrl: string;
  rawBody: string;
  signature: string | null;
  signatureKey: string;
}) {
  if (!signature) return false;
  const expected = createHmac('sha256', signatureKey)
    .update(`${notificationUrl}${rawBody}`)
    .digest('base64');

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function parseSquareEvent(rawBody: string): SquareWebhookEvent {
  const event = JSON.parse(rawBody) as SquareWebhookEvent;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    throw new Error('Invalid Square webhook payload');
  }
  return event;
}

function getObject(event: SquareWebhookEvent, key: string) {
  const object = event.data?.object;
  if (!object || typeof object !== 'object') return null;
  const value = object[key];
  if (value && typeof value === 'object') return value;
  if (typeof object.id === 'string' && object.id) return object;
  return value && typeof value === 'object' ? value : null;
}

export async function handleInventorySquareWebhookEvent(
  event: SquareWebhookEvent,
  context: { environment?: SquareEnvironment; wsId?: string } = {}
) {
  const type = event.type ?? '';

  if (type === 'device.code.paired' && context.environment && context.wsId) {
    const deviceCode = getObject(event, 'device_code');
    if (!deviceCode) return false;
    return syncInventorySquareDeviceCodePaired({
      deviceCode: deviceCode as SquareApiDeviceCode,
      environment: context.environment,
      wsId: context.wsId,
    });
  }

  if (type.startsWith('terminal.checkout.')) {
    const checkout = getObject(event, 'checkout');
    if (!checkout) return false;
    return syncInventorySquareTerminalCheckout(
      checkout as SquareApiTerminalCheckout,
      {
        eventId: event.event_id,
      }
    );
  }

  if (type.startsWith('payment.')) {
    const payment = getObject(event, 'payment');
    if (!payment) return false;
    return syncInventorySquarePayment(payment as SquareApiPayment, {
      eventId: event.event_id,
    });
  }

  if (type.startsWith('oauth.authorization.revoked')) {
    if (context.environment && context.wsId) {
      await markConnectionRevoked({
        environment: context.environment,
        merchantId: event.merchant_id,
        wsId: context.wsId,
      });
    } else if (context.environment && event.merchant_id) {
      await markConnectionsRevokedByMerchantId({
        environment: context.environment,
        merchantId: event.merchant_id,
      });
    }
    serverLogger.warn('Square OAuth authorization revoked', {
      eventId: event.event_id,
      merchantId: event.merchant_id,
    });
    return true;
  }

  return false;
}

export async function processInventorySquareWebhook({
  rawBody,
  requestUrl,
  signature,
  wsId,
}: {
  rawBody: string;
  requestUrl: string;
  signature: string | null;
  wsId?: string;
}) {
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || requestUrl;
  const secrets: Array<{ environment: SquareEnvironment; secret: string }> =
    wsId
      ? await getInventorySquareWebhookSecrets(wsId)
      : [
          {
            environment: 'production',
            secret: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '',
          },
        ];

  const matchingSecret = secrets.find(
    (item) =>
      item.secret &&
      verifySquareWebhookSignature({
        notificationUrl,
        rawBody,
        signature,
        signatureKey: item.secret,
      })
  );

  if (!matchingSecret) throw new SquareWebhookSignatureError();

  const event = parseSquareEvent(rawBody);
  await handleInventorySquareWebhookEvent(event, {
    environment: matchingSecret.environment,
    wsId,
  });
  return {
    environment: matchingSecret.environment,
    eventType: event.type ?? 'unknown',
  };
}

import {
  type Checkout,
  type Order,
  type Product,
  validateEvent,
  WebhookVerificationError,
} from '@tuturuuu/payment/polar';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getInventoryPolarWebhookSecret,
  syncInventoryPolarCheckout,
  syncInventoryPolarOrder,
} from '@/lib/inventory/commerce/polar';
import { applyPolarProductToInventory } from '@/lib/inventory/commerce/polar-product-sync';

interface Params {
  params: Promise<{ wsId: string }>;
}

// A workspace connects its own Polar org, so each org points its webhook at this
// per-workspace URL. We don't know which environment (sandbox/production) the
// event came from, so verify against each configured signing secret in turn.
const ENVIRONMENTS = ['production', 'sandbox'] as const;

type PolarWebhookEvent = ReturnType<typeof validateEvent>;

async function handleInventoryPolarEvent(event: PolarWebhookEvent) {
  const { type } = event;
  if (type.startsWith('checkout')) {
    await syncInventoryPolarCheckout(event.data as Checkout);
  } else if (type.startsWith('order')) {
    await syncInventoryPolarOrder(event.data as Order);
  } else if (type.startsWith('product')) {
    await applyPolarProductToInventory(event.data as Product);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let hasSecret = false;
  for (const environment of ENVIRONMENTS) {
    const secret = await getInventoryPolarWebhookSecret(wsId, environment);
    if (!secret) continue;
    hasSecret = true;

    let event: PolarWebhookEvent;
    try {
      event = validateEvent(body, headers, secret);
    } catch (error) {
      // Wrong-environment secret: try the next one. Any other error is fatal.
      if (error instanceof WebhookVerificationError) continue;
      serverLogger.error('Inventory Polar webhook verification error', error);
      return NextResponse.json({ message: 'Webhook error' }, { status: 400 });
    }

    try {
      await handleInventoryPolarEvent(event);
    } catch (error) {
      serverLogger.error(
        'Failed to handle inventory Polar webhook event',
        error
      );
      return NextResponse.json(
        { message: 'Event handling failed' },
        { status: 500 }
      );
    }
    return NextResponse.json({ received: true });
  }

  // No configured secret matched the signature.
  return NextResponse.json(
    {
      message: hasSecret
        ? 'Webhook signature verification failed'
        : 'No Polar webhook secret configured for this workspace',
    },
    { status: 401 }
  );
}

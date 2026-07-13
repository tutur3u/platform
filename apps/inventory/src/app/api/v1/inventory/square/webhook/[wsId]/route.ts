import {
  processInventorySquareWebhook,
  SquareWebhookSignatureError,
  syncInventorySquareCatalog,
} from '@tuturuuu/inventory-core/commerce/square';
import { after, NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');

  try {
    const result = await processInventorySquareWebhook({
      rawBody,
      requestUrl: request.url,
      signature,
      wsId,
    });
    if (
      result.eventType === 'catalog.version.updated' ||
      result.eventType === 'inventory.count.updated'
    ) {
      after(async () => {
        try {
          await syncInventorySquareCatalog({
            direction: 'from_square',
            userId: null,
            wsId,
          });
        } catch (error) {
          console.error('Deferred Square catalog sync failed', error);
        }
      });
    }
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof SquareWebhookSignatureError) {
      return NextResponse.json(
        { message: 'Webhook signature verification failed' },
        { status: 401 }
      );
    }

    console.error('Failed to handle Square webhook', error);
    return NextResponse.json(
      { message: 'Event handling failed' },
      { status: 500 }
    );
  }
}

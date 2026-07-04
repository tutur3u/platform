import {
  processInventorySquareWebhook,
  SquareWebhookSignatureError,
} from '@tuturuuu/inventory-core/commerce/square';
import { NextResponse } from 'next/server';

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

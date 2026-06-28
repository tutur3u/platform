import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  processInventorySquareWebhook,
  SquareWebhookSignatureError,
} from '@/lib/inventory/commerce/square';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');

  try {
    const result = await processInventorySquareWebhook({
      rawBody,
      requestUrl: request.url,
      signature,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof SquareWebhookSignatureError) {
      return NextResponse.json(
        { message: 'Webhook signature verification failed' },
        { status: 401 }
      );
    }

    serverLogger.error('Failed to handle Square webhook', error);
    return NextResponse.json(
      { message: 'Event handling failed' },
      { status: 500 }
    );
  }
}

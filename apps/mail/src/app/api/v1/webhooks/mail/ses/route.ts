import { type NextRequest, NextResponse } from 'next/server';
import {
  ingestSesNotification,
  logSesInboundError,
  parseSnsEnvelope,
  verifySnsEnvelope,
} from '@/lib/mail/inbound';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    const { envelope, notification } = parseSnsEnvelope(rawBody);
    const verified = await verifySnsEnvelope(envelope);

    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (envelope.Type === 'SubscriptionConfirmation') {
      return NextResponse.json({
        message: 'Subscription confirmation received; confirm manually in AWS.',
      });
    }

    const result = await ingestSesNotification(notification);
    return NextResponse.json(result);
  } catch (error) {
    logSesInboundError(error);
    return NextResponse.json(
      { error: 'Failed to process SES notification' },
      { status: 500 }
    );
  }
}

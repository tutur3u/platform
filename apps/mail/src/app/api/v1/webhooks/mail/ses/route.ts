import { type NextRequest, NextResponse } from 'next/server';
import {
  ingestSesNotification,
  logSesInboundError,
  parseSnsEnvelope,
  verifySnsEnvelope,
} from '@/lib/mail/inbound';

/**
 * SES inbound is optional. Without a configured SNS topic the endpoint answers
 * 410 Gone before reading or verifying the body; SNS treats 410 as permanent.
 */
function sesInboundConfigured() {
  return Boolean(process.env.MAIL_SES_INBOUND_TOPIC_ARN?.trim());
}

export async function POST(request: NextRequest) {
  if (!sesInboundConfigured()) {
    return NextResponse.json(
      { error: 'SES inbound is not configured' },
      { status: 410 }
    );
  }
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

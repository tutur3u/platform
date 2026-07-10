import { NextResponse } from 'next/server';
import {
  cloudflareInboundEventSchema,
  handleCloudflareInboundEvent,
  verifyCloudflareWebhookSignature,
} from '@/lib/mail/inbound/cloudflare';

export async function POST(request: Request) {
  const secret = process.env.MAIL_CLOUDFLARE_INGEST_SECRET;
  if (!secret) {
    console.error('[mail] Cloudflare ingestion secret is not configured');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const body = await request.text();
  if (
    !verifyCloudflareWebhookSignature({
      body,
      secret,
      signature: request.headers.get('x-tuturuuu-mail-signature'),
      timestamp: request.headers.get('x-tuturuuu-mail-timestamp'),
    })
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = cloudflareInboundEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid ingestion event' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await handleCloudflareInboundEvent(parsed.data));
  } catch (error) {
    console.error('[mail] Cloudflare inbound ingestion failed', { error });
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}

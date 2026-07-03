import { NextResponse } from 'next/server';
import { provisionSepayWebhookEndpoint } from '../service';
import { requireSepayAccess, requireSepayFeatureEnabled } from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const access = await requireSepayAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const featureError = await requireSepayFeatureEnabled({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
  });

  if (featureError) {
    return featureError;
  }

  try {
    const result = await provisionSepayWebhookEndpoint({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to provision SePay webhooks:', error);
    return NextResponse.json(
      { message: 'Failed to provision SePay webhooks' },
      { status: 502 }
    );
  }
}

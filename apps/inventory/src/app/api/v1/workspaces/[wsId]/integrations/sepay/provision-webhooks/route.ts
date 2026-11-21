import { NextResponse } from 'next/server';
import { getSepayOauthEnv } from '@/lib/sepay-oauth';
import { provisionSepayWebhookEndpoint } from '../service';
import {
  requireSepayAccess,
  requireSepayFeatureEnabled,
  sepayReconfiguringResponse,
  sepayReconnectResponse,
} from '../shared';

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

  if (!getSepayOauthEnv()) return sepayReconfiguringResponse();

  try {
    const result = await provisionSepayWebhookEndpoint({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const reconnect = sepayReconnectResponse(error);
    if (reconnect) return reconnect;
    console.error('Failed to provision SePay webhooks:', error);
    return NextResponse.json(
      { message: 'Failed to provision SePay webhooks' },
      { status: 502 }
    );
  }
}

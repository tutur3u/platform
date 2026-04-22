import { NextResponse } from 'next/server';
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

  const nowIso = new Date().toISOString();

  const { error: disconnectError } = await access.sbAdmin.rpc(
    'disconnect_sepay_integration',
    {
      p_now: nowIso,
      p_ws_id: access.wsId,
    }
  );

  if (disconnectError) {
    console.error('Failed to disconnect SePay integration:', disconnectError);
    return NextResponse.json(
      {
        error: 'DISCONNECT_SEPAY_INTEGRATION_FAILED',
        message: 'Failed to disconnect SePay integration',
        success: false,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

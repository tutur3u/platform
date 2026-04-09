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

  const { error: disableEndpointsError } = await access.sbAdmin
    .from('sepay_webhook_endpoints')
    .update({
      active: false,
      deleted_at: nowIso,
      rotated_at: nowIso,
    })
    .eq('ws_id', access.wsId)
    .eq('active', true)
    .is('deleted_at', null);

  if (disableEndpointsError) {
    console.error(
      'Failed to disable SePay endpoints during disconnect:',
      disableEndpointsError
    );
    return NextResponse.json(
      { message: 'Failed to disconnect SePay integration' },
      { status: 500 }
    );
  }

  const { error: deactivateConnectionsError } = await access.sbAdmin
    .from('sepay_connections')
    .update({
      status: 'revoked',
      updated_at: nowIso,
    })
    .eq('ws_id', access.wsId);

  if (deactivateConnectionsError) {
    console.error(
      'Failed to revoke SePay connection during disconnect:',
      deactivateConnectionsError
    );
    return NextResponse.json(
      { message: 'Failed to disconnect SePay integration' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

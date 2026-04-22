import { NextResponse } from 'next/server';
import {
  createSepayEndpointTokenRow,
  endpointIdSchema,
  requireSepayAccess,
  requireSepayFeatureEnabled,
} from '../../../shared';

interface Params {
  params: Promise<{
    id: string;
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const { id: rawEndpointId, wsId: rawWsId } = await params;
  const access = await requireSepayAccess(request, rawWsId);
  if ('error' in access) {
    return access.error;
  }

  const parsedEndpointId = endpointIdSchema.safeParse({ id: rawEndpointId });
  if (!parsedEndpointId.success) {
    return NextResponse.json(
      { message: 'Invalid endpoint id' },
      { status: 400 }
    );
  }

  const endpointId = parsedEndpointId.data.id;
  const { sbAdmin, wsId } = access;
  const featureError = await requireSepayFeatureEnabled({ sbAdmin, wsId });
  if (featureError) {
    return featureError;
  }

  const { data: existing, error: existingError } = await sbAdmin
    .from('sepay_webhook_endpoints')
    .select('id, ws_id, wallet_id, active, rotated_at, sepay_webhook_id')
    .eq('id', endpointId)
    .eq('ws_id', wsId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    console.error('Error loading SePay endpoint for rotation:', existingError);
    return NextResponse.json(
      { message: 'Error rotating SePay endpoint' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'SePay endpoint not found' },
      { status: 404 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: deactivatedEndpoint, error: deactivateError } = await sbAdmin
    .from('sepay_webhook_endpoints')
    .update({ active: false, rotated_at: nowIso })
    .eq('id', endpointId)
    .eq('ws_id', wsId)
    .eq('active', true)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (deactivateError) {
    console.error(
      'Error deactivating old SePay endpoint token:',
      deactivateError
    );
    return NextResponse.json(
      { message: 'Error rotating SePay endpoint' },
      { status: 500 }
    );
  }

  if (!deactivatedEndpoint) {
    return NextResponse.json(
      { message: 'SePay endpoint was already rotated' },
      { status: 409 }
    );
  }

  const {
    data: rotated,
    error: createError,
    token,
  } = await createSepayEndpointTokenRow({
    active: true,
    sbAdmin,
    sepayWebhookId: existing.sepay_webhook_id,
    walletId: existing.wallet_id,
    wsId,
  });

  if (createError || !rotated) {
    console.error('Error creating rotated SePay endpoint token:', createError);

    const { error: rollbackError } = await sbAdmin
      .from('sepay_webhook_endpoints')
      .update({
        active: existing.active ?? true,
        rotated_at: existing.rotated_at ?? null,
      })
      .eq('id', endpointId)
      .eq('ws_id', wsId)
      .is('deleted_at', null);

    if (rollbackError) {
      console.error(
        'Error rolling back SePay endpoint rotation deactivation:',
        rollbackError
      );
    }

    return NextResponse.json(
      { message: 'Error rotating SePay endpoint' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...rotated,
    token,
  });
}

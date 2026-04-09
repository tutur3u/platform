import { NextResponse } from 'next/server';
import {
  endpointIdSchema,
  requireSepayAccess,
  requireSepayFeatureEnabled,
} from '../../shared';

interface Params {
  params: Promise<{
    id: string;
    wsId: string;
  }>;
}

export async function DELETE(request: Request, { params }: Params) {
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
    .select('id')
    .eq('id', endpointId)
    .eq('ws_id', wsId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    console.error('Error validating SePay endpoint ownership:', existingError);
    return NextResponse.json(
      { message: 'Error deleting SePay endpoint' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'SePay endpoint not found' },
      { status: 404 }
    );
  }

  const { error: deleteError } = await sbAdmin
    .from('sepay_webhook_endpoints')
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq('id', endpointId)
    .eq('ws_id', wsId)
    .eq('active', true)
    .is('deleted_at', null);

  if (deleteError) {
    console.error('Error deleting SePay endpoint:', deleteError);
    return NextResponse.json(
      { message: 'Error deleting SePay endpoint' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

import { NextResponse } from 'next/server';
import {
  createSepayEndpointTokenRow,
  ensureWalletBelongsToWorkspace,
  requireSepayAccess,
  requireSepayFeatureEnabled,
  sepayEndpointBodySchema,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

const endpointSelectColumns =
  'id, ws_id, wallet_id, token_prefix, active, sepay_webhook_id, created_at, rotated_at, last_used_at';

export async function GET(request: Request, { params }: Params) {
  const access = await requireSepayAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;
  const featureError = await requireSepayFeatureEnabled({ sbAdmin, wsId });
  if (featureError) {
    return featureError;
  }

  const { data, error } = await sbAdmin
    .from('sepay_webhook_endpoints')
    .select(endpointSelectColumns)
    .eq('ws_id', wsId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing SePay endpoints:', error);
    return NextResponse.json(
      { message: 'Error fetching SePay endpoints' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request, { params }: Params) {
  const access = await requireSepayAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = sepayEndpointBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { sbAdmin, wsId } = access;
  const featureError = await requireSepayFeatureEnabled({ sbAdmin, wsId });
  if (featureError) {
    return featureError;
  }
  const payload = parsed.data;

  if (payload.walletId) {
    const walletCheck = await ensureWalletBelongsToWorkspace({
      sbAdmin,
      walletId: payload.walletId,
      wsId,
    });

    if (!walletCheck.ok) {
      if (walletCheck.status === 400) {
        return NextResponse.json(
          { message: 'Invalid wallet' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { message: 'Error validating wallet' },
        { status: 500 }
      );
    }
  }

  const { data, error, token } = await createSepayEndpointTokenRow({
    active: payload.active,
    sbAdmin,
    sepayWebhookId: payload.sepayWebhookId,
    walletId: payload.walletId,
    wsId,
  });

  if (error || !data) {
    console.error('Error creating SePay endpoint:', error);
    return NextResponse.json(
      { message: 'Error creating SePay endpoint' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ...data,
      token,
    },
    { status: 201 }
  );
}

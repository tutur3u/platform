import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) return access.response;

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  if (permissions.withoutPermission('create_invoices')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view invoice promotions' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id, polar_discount_id, created_at'
    )
    .eq('ws_id', normalizedWsId)
    .order('code', { ascending: true });

  if (error) {
    console.error('Failed to load Finance invoice promotions', {
      error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

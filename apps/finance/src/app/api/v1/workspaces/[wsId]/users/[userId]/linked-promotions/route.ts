import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ userId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { userId, wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) return access.response;

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  if (permissions.withoutPermission('create_invoices')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked promotions' },
      { status: 403 }
    );
  }

  const privateDb = sbAdmin.schema('private');
  const { data: links, error } = await privateDb
    .from('user_linked_promotions')
    .select('promo_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to load Finance customer promotion links', {
      error,
      userId,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }

  const promoIds = [...new Set((links ?? []).map((link) => link.promo_id))];
  if (promoIds.length === 0) return NextResponse.json([]);

  const { data: promotions, error: promotionsError } = await privateDb
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id'
    )
    .eq('ws_id', normalizedWsId)
    .in('id', promoIds);

  if (promotionsError) {
    console.error('Failed to load Finance customer-linked promotions', {
      error: promotionsError,
      userId,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }

  const promotionsById = new Map(
    (promotions ?? []).map((promotion) => [promotion.id, promotion])
  );

  return NextResponse.json(
    (links ?? [])
      .map((link) => ({
        promo_id: link.promo_id,
        workspace_promotions: promotionsById.get(link.promo_id) ?? null,
      }))
      .filter((link) => link.workspace_promotions)
  );
}

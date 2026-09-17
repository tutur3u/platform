import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { NextResponse } from 'next/server';
import { forwardPromotionMutation } from '@/lib/promotion-mutations';

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
  if (
    permissions.withoutPermission('create_invoices') &&
    permissions.withoutPermission('view_inventory')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view invoice promotions' },
      { status: 403 }
    );
  }

  const parsed = parseInventoryApiListQuery(request);
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  const paginate = shouldReturnPaginatedInventoryList(request);
  const query = sbAdmin
    .schema('private')
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id, polar_discount_id, created_at',
      { count: paginate ? 'exact' : undefined }
    )
    .eq('ws_id', normalizedWsId)
    .order('code', { ascending: true });
  if (parsed.data.q) query.ilike('name', `%${parsed.data.q}%`);
  if (paginate) {
    const { start, end } = getInventoryApiListRange(parsed.data);
    query.range(start, end);
  }
  const { data, error, count } = await query;

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

  return NextResponse.json(
    paginate ? { data: data ?? [], count: count ?? 0 } : (data ?? []),
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  return forwardPromotionMutation(request, wsId);
}

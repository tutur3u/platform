import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export async function GET(req: Request) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const { searchParams } = new URL(req.url);
  const wsId = searchParams.get('ws_id');
  const limit = searchParams.get('limit') || '1000';
  const offset = searchParams.get('offset') || '0';

  if (!wsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const { data: promotions, error: promotionsError } = await privateDb
    .from('workspace_promotions')
    .select('id, ws_id')
    .eq('ws_id', wsId);

  if (promotionsError) {
    serverLogger.error('Error fetching workspace_promotions:', promotionsError);
    return NextResponse.json(
      { message: 'Error fetching workspace_promotions' },
      { status: 500 }
    );
  }

  const promotionIds = (promotions ?? []).map((promotion) => promotion.id);

  if (promotionIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 });
  }

  const promotionWorkspaceById = new Map(
    (promotions ?? []).map((promotion) => [
      promotion.id,
      { ws_id: promotion.ws_id },
    ])
  );

  const { data, error, count } = await privateDb
    .from('user_linked_promotions')
    .select('*', { count: 'exact' })
    .in('promo_id', promotionIds)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    serverLogger.error('Error fetching user_linked_promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching user_linked_promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data || []).map((link) => ({
      ...link,
      workspace_promotions: promotionWorkspaceById.get(link.promo_id) ?? null,
    })),
    count: count || 0,
  });
}

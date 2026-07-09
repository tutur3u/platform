import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId, userId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;
  const privateDb = sbAdmin.schema('private');

  const { data: links, error } = await privateDb
    .from('user_linked_promotions')
    .select('promo_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching linked promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }

  const promoIds = [...new Set((links ?? []).map((link) => link.promo_id))];

  if (promoIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: promotions, error: promotionsError } = await privateDb
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id'
    )
    .eq('ws_id', wsId)
    .in('id', promoIds);

  if (promotionsError) {
    console.error('Error fetching linked promotions:', promotionsError);
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

export async function POST(req: Request, { params }: Params) {
  const { wsId: rawWsId, userId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;
  const privateDb = sbAdmin.schema('private');

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const schema = z.object({
    promoId: z.guid(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { promoId } = parsed.data;

  // Verify promotion belongs to workspace
  const { data: promo, error: promoError } = await privateDb
    .from('workspace_promotions')
    .select('id')
    .eq('id', promoId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (promoError || !promo) {
    return NextResponse.json(
      { message: 'Promotion not found' },
      { status: 404 }
    );
  }

  const { error } = await privateDb.from('user_linked_promotions').insert({
    user_id: userId,
    promo_id: promoId,
  });

  if (error) {
    console.error('Error linking promotion:', error);
    return NextResponse.json(
      { message: 'Error linking promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: rawWsId, userId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { permissions, sbAdmin } = access.context;
  const privateDb = sbAdmin.schema('private');

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const promoId = searchParams.get('promoId');

  if (!promoId) {
    return NextResponse.json(
      { message: 'Missing promoId parameter' },
      { status: 400 }
    );
  }

  const { error } = await privateDb
    .from('user_linked_promotions')
    .delete()
    .eq('user_id', userId)
    .eq('promo_id', promoId);

  if (error) {
    console.error('Error unlinking promotion:', error);
    return NextResponse.json(
      { message: 'Error unlinking promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

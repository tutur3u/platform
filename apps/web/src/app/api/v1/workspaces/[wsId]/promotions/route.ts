import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getInventoryApiListRange,
  parseInventoryApiListQuery,
  shouldReturnPaginatedInventoryList,
} from '@tuturuuu/inventory-core/api-list-query';
import { syncInventoryPromotionDiscount } from '@tuturuuu/inventory-core/commerce/polar';

const PromotionSchema = z
  .object({
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    code: z.string().min(1).max(MAX_NAME_LENGTH),
    value: z.coerce.number().min(0),
    unit: z.enum(['percentage', 'currency']).optional(),
    // NULL/undefined = unlimited
    max_uses: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  })
  .refine(
    ({ unit, value }) =>
      (unit === 'percentage' && value <= 100) || unit !== 'percentage',
    {
      // TODO: i18n
      message: 'Percentage value cannot exceed 100%',
      path: ['value'],
    }
  );

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const shouldPaginate = shouldReturnPaginatedInventoryList(req);
  const parsedQuery = parseInventoryApiListQuery(req);

  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req, {
      // The inventory operator dashboard manages storefront promotions too.
      targetApp: ['finance', 'platform', 'inventory'],
    })
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;
  const privateDb = sbAdmin.schema('private');
  const { searchParams } = new URL(req.url);
  const inventoryOnly = searchParams.get('inventoryOnly') === 'true';

  const query = privateDb
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id, polar_discount_id, created_at',
      { count: shouldPaginate ? 'exact' : undefined }
    )
    .eq('ws_id', wsId);

  const { q, page, pageSize } = parsedQuery.data;
  if (inventoryOnly) query.neq('promo_type', 'REFERRAL');
  if (q) query.ilike('name', `%${q}%`);
  if (shouldPaginate) {
    const { start, end } = getInventoryApiListRange({ page, pageSize });
    query.range(start, end);
  }

  const { data, error, count } = await query.order('code', {
    ascending: true,
  });

  if (error) {
    serverLogger.error('Error fetching promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching promotions' },
      { status: 500 }
    );
  }

  if (shouldPaginate) {
    return NextResponse.json({ count: count ?? 0, data: data ?? [] });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req, {
      // The inventory operator dashboard manages storefront promotions too.
      targetApp: ['finance', 'platform', 'inventory'],
    })
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin, user } = access.context;

  // Validate request body
  const parsed = PromotionSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { withoutPermission } = permissions;
  if (withoutPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create promotions' },
      { status: 403 }
    );
  }

  // Get the virtual_user_id for this workspace
  const { data: wsUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  if (!wsUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const data = parsed.data;
  const privateDb = sbAdmin.schema('private');

  const { data: created, error } = await privateDb
    .from('workspace_promotions')
    .insert({
      name: data.name,
      description: data.description,
      code: data.code,
      value: data.value,
      creator_id: wsUser.virtual_user_id,
      ws_id: wsId,
      use_ratio: data.unit === 'percentage',
      max_uses: data.max_uses ?? null,
    })
    .select('id, name, code, value, use_ratio, max_uses, current_uses')
    .single();

  if (error) {
    serverLogger.error('Error creating promotion:', error);
    return NextResponse.json(
      { message: 'Error creating promotion' },
      { status: 500 }
    );
  }

  // Best-effort: mirror the coupon to Polar so it applies at Polar checkout.
  // Non-throwing — a Polar hiccup must not fail promotion creation.
  try {
    const { discountId } = await syncInventoryPromotionDiscount({
      promotion: {
        code: data.code,
        max_uses: data.max_uses ?? null,
        name: data.name,
        use_ratio: data.unit === 'percentage',
        value: data.value,
      },
      wsId,
    });

    if (discountId && created?.id) {
      await privateDb
        .from('workspace_promotions')
        .update({ polar_discount_id: discountId })
        .eq('id', created.id);
    }
  } catch (polarError) {
    serverLogger.warn('Polar promotion mirror failed', polarError);
  }

  return NextResponse.json({ message: 'success', data: created });
}

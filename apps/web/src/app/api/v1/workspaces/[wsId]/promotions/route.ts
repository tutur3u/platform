import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const { data, error } = await sbAdmin
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses'
    )
    .eq('ws_id', wsId)
    .order('code', { ascending: true });

  if (error) {
    serverLogger.error('Error fetching promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
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

  const { data: created, error } = await sbAdmin
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

  return NextResponse.json({ message: 'success', data: created });
}

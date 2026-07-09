import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PromotionUpdateSchema = z
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
    promotionId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, promotionId } = await params;
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

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;
  if (permissions.withoutPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update promotions' },
      { status: 403 }
    );
  }

  const privateDb = sbAdmin.schema('private');
  const parsed = PromotionUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const updateData: TablesUpdate<
    { schema: 'private' },
    'workspace_promotions'
  > = {
    name: data.name,
    description: data.description,
    code: data.code,
    value: data.value,
    use_ratio: data.unit === 'percentage',
  };

  if ('max_uses' in data) {
    updateData.max_uses = data.max_uses ?? null;
  }

  const { error } = await privateDb
    .from('workspace_promotions')
    .update({
      ...updateData,
    })
    .eq('id', promotionId)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error updating promotion:', error);
    return NextResponse.json(
      { message: 'Error updating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: rawWsId, promotionId } = await params;
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

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;
  if (permissions.withoutPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete promotions' },
      { status: 403 }
    );
  }

  const privateDb = sbAdmin.schema('private');

  const { error } = await privateDb
    .from('workspace_promotions')
    .delete()
    .eq('id', promotionId)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error deleting promotion:', error);
    return NextResponse.json(
      { message: 'Error deleting promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

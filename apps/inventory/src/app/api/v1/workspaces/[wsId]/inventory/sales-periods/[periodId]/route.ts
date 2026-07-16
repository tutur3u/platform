import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canDeleteInventorySales,
  canUpdateInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import {
  deleteInventorySalesPeriod,
  updateInventorySalesPeriod,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PeriodPatchSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    ends_at: z.iso.date().nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    product_ids: z.array(z.uuid()).max(500).optional(),
    product_scope: z.enum(['all', 'allowlist', 'blocklist']).optional(),
    starts_at: z.iso.date().nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (payload) =>
      !(payload.starts_at && payload.ends_at) ||
      payload.starts_at <= payload.ends_at,
    { message: 'Start date must be on or before end date', path: ['ends_at'] }
  )
  .refine(
    (payload) =>
      payload.product_scope === undefined ||
      payload.product_scope === 'all' ||
      (payload.product_ids?.length ?? 0) > 0,
    {
      message: 'Choose at least one product for this product rule',
      path: ['product_ids'],
    }
  );

interface Params {
  params: Promise<{ periodId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const { periodId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canUpdateInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = PeriodPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid sales period', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const data = await updateInventorySalesPeriod({
      payload: parsed.data,
      periodId,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to update inventory sales period', error);
    return NextResponse.json(
      { message: 'Failed to update inventory sales period' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { periodId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canDeleteInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const sbAdmin = await createAdminClient();
    const result = await deleteInventorySalesPeriod({
      periodId,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    if (result.reason === 'in_use') {
      return NextResponse.json(
        { message: 'Archive periods that already contain sales' },
        { status: 409 }
      );
    }
    if (!result.deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete inventory sales period', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory sales period' },
      { status: 500 }
    );
  }
}

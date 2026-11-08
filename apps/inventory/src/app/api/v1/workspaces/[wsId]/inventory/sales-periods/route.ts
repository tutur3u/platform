import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { pricingErrorStatus } from '@tuturuuu/inventory-core/period-pricing';
import {
  canCreateInventorySales,
  canViewInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import {
  INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID,
  INVENTORY_DEFAULT_SALES_PERIOD_CONFIG_ID,
  planSalesPeriodAutoDefault,
} from '@tuturuuu/inventory-core/sales-period-default-policy';
import {
  createInventorySalesPeriod,
  listInventorySalesPeriods,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PeriodPayloadSchema = z
  .object({
    pricing_mode: z.enum(['legacy', 'scheduled']).optional(),
    time_zone: z.string().max(100).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    ends_at: z.iso.date().nullable().optional(),
    name: z.string().trim().min(1).max(120),
    product_ids: z.array(z.uuid()).max(500).optional(),
    product_scope: z.enum(['all', 'allowlist', 'blocklist']).default('all'),
    starts_at: z.iso.date().nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.pricing_mode !== 'scheduled' ||
      Boolean(payload.starts_at && payload.ends_at && payload.time_zone),
    { message: 'Scheduled prices require dates and an IANA timezone' }
  )
  .refine(
    (payload) =>
      !(payload.starts_at && payload.ends_at) ||
      payload.starts_at <= payload.ends_at,
    { message: 'Start date must be on or before end date', path: ['ends_at'] }
  )
  .refine(
    (payload) =>
      payload.product_scope === 'all' || (payload.product_ids?.length ?? 0) > 0,
    {
      message: 'Choose at least one product for this product rule',
      path: ['product_ids'],
    }
  );

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canViewInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const includeArchived =
      new URL(request.url).searchParams.get('include_archived') === 'true';
    const sbAdmin = await createAdminClient();
    const data = await listInventorySalesPeriods({
      includeArchived,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to list inventory sales periods', error);
    return NextResponse.json(
      { message: 'Failed to list inventory sales periods' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canCreateInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = PeriodPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid sales period', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const data = await createInventorySalesPeriod({
      actorId: authorization.value.userId,
      payload: parsed.data,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    const salesDefault = await applySavedSalesPeriodAutoDefault({
      period: data,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data, salesDefault }, { status: 201 });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      return NextResponse.json(
        { message: 'A sales period with this name already exists' },
        { status: 409 }
      );
    }
    console.error('Failed to create inventory sales period', error);
    return NextResponse.json(
      {
        message:
          'Failed to create inventory sales period; season pricing may be unavailable',
      },
      { status: pricingErrorStatus(error) }
    );
  }
}

async function applySavedSalesPeriodAutoDefault({
  period,
  sbAdmin,
  wsId,
}: {
  period: { id?: string | null; ws_id?: string | null };
  sbAdmin: Awaited<ReturnType<typeof createAdminClient<Database>>>;
  wsId: string;
}) {
  try {
    const read = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID)
      .maybeSingle();
    const plan = planSalesPeriodAutoDefault({
      periodId: period.id,
      periodWsId: period.ws_id,
      policyReadFailed: Boolean(read.error),
      policyStored: read.data?.value ?? null,
      wsId,
    });
    if (plan.action !== 'update') return { status: plan.action };
    const write = await sbAdmin.from('workspace_configs').upsert(
      {
        id: INVENTORY_DEFAULT_SALES_PERIOD_CONFIG_ID,
        updated_at: new Date().toISOString(),
        value: plan.periodId,
        ws_id: plan.wsId,
      },
      { onConflict: 'ws_id,id' }
    );
    if (write.error) return { status: 'failed' as const };
    return { status: 'updated' as const };
  } catch {
    return { status: 'failed' as const };
  }
}

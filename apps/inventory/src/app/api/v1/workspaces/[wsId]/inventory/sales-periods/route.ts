import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import {
  createInventorySalesPeriod,
  listInventorySalesPeriods,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PeriodPayloadSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    ends_at: z.iso.date().nullable().optional(),
    name: z.string().trim().min(1).max(120),
    starts_at: z.iso.date().nullable().optional(),
  })
  .refine(
    (payload) =>
      !(payload.starts_at && payload.ends_at) ||
      payload.starts_at <= payload.ends_at,
    { message: 'Start date must be on or before end date', path: ['ends_at'] }
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
    return NextResponse.json({ data }, { status: 201 });
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
      { message: 'Failed to create inventory sales period' },
      { status: 500 }
    );
  }
}

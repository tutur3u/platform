import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canUpdateInventorySales } from '@tuturuuu/inventory-core/permissions';
import {
  InventorySalesPeriodProductRuleError,
  setInventorySalesPeriodBulk,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const BulkAssignmentSchema = z.object({
  period_id: z.uuid().nullable(),
  sales: z
    .array(
      z.object({
        id: z.uuid(),
        source: z.enum(['checkout_session', 'finance_invoice']),
      })
    )
    .min(1)
    .max(100),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canUpdateInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = BulkAssignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: 'Invalid bulk sales period assignment',
        errors: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const data = await setInventorySalesPeriodBulk({
      actorId: authorization.value.userId,
      periodId: parsed.data.period_id,
      sales: parsed.data.sales,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    if (parsed.data.period_id && !data) {
      return NextResponse.json(
        { message: 'Period not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data, updated: parsed.data.sales.length });
  } catch (error) {
    if (error instanceof InventorySalesPeriodProductRuleError) {
      return NextResponse.json(
        { message: 'One or more sales do not match the period product rules' },
        { status: 422 }
      );
    }
    if (
      error instanceof Error &&
      error.message === 'One or more inventory sales were not found'
    ) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    console.error('Failed to bulk assign inventory sales period', error);
    return NextResponse.json(
      { message: 'Failed to bulk assign inventory sales period' },
      { status: 500 }
    );
  }
}

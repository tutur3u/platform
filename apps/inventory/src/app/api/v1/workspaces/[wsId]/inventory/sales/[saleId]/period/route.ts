import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canUpdateInventorySales } from '@tuturuuu/inventory-core/permissions';
import { setInventorySalePeriod } from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const AssignmentSchema = z.object({
  period_id: z.uuid().nullable(),
  source: z.enum(['checkout_session', 'finance_invoice']),
});

interface Params {
  params: Promise<{ saleId: string; wsId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { saleId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canUpdateInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = AssignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: 'Invalid sales period assignment',
        errors: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const { period_id: periodId, source } = parsed.data;
    const saleQuery =
      source === 'finance_invoice'
        ? sbAdmin.from('finance_invoices')
        : sbAdmin.schema('private').from('inventory_checkout_sessions');
    const { data: sale, error: saleError } = await saleQuery
      .select('id')
      .eq('id', saleId)
      .eq('ws_id', authorization.value.wsId)
      .maybeSingle();

    if (saleError) throw saleError;
    if (!sale) {
      return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
    }

    const data = await setInventorySalePeriod({
      actorId: authorization.value.userId,
      periodId,
      saleId,
      saleSource: source,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
    if (periodId && !data) {
      return NextResponse.json(
        { message: 'Period not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to assign inventory sale period', error);
    return NextResponse.json(
      { message: 'Failed to assign inventory sale period' },
      { status: 500 }
    );
  }
}

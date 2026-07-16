import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import {
  getInventoryCommerceSummary,
  getInventorySalesPeriod,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  period_id: z.uuid().optional(),
  unassigned: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canViewInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { period_id: periodId, unassigned: unassignedOnly } = parsed.data;
  if (periodId && unassignedOnly) {
    return NextResponse.json(
      { message: 'Choose either a period or unassigned sales' },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const { wsId } = authorization.value;
    const [period, configuredCurrency] = await Promise.all([
      periodId
        ? getInventorySalesPeriod({ periodId, sbAdmin, wsId })
        : Promise.resolve(null),
      getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    ]);
    if (periodId && !period) {
      return NextResponse.json(
        { message: 'Period not found' },
        { status: 404 }
      );
    }
    const currency = resolveSupportedCurrency(configuredCurrency);
    const data = await getInventoryCommerceSummary({
      currency,
      periodId,
      sbAdmin,
      unassignedOnly,
      wsId,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch inventory commerce summary', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory commerce summary' },
      { status: 500 }
    );
  }
}

import type { InventoryAnalyticsResponse } from '@tuturuuu/internal-api/inventory';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventoryAnalytics } from '@tuturuuu/inventory-core/permissions';
import { getWorkspaceDefaultCurrency } from '@tuturuuu/inventory-core/workspace-currency';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

const QuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export async function GET(request: Request, { params }: Params) {
  await connection();
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid analytics range', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canViewInventoryAnalytics(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { wsId } = authorization.value;
    const sbAdmin = await createAdminClient();
    const [{ data, error }, currency] = await Promise.all([
      sbAdmin.schema('private').rpc(
        'get_inventory_analytics' as never,
        {
          p_days: parsed.data.days,
          p_ws_id: wsId,
        } as never
      ),
      getWorkspaceDefaultCurrency(wsId),
    ]);

    if (error) throw error;
    if (!data) throw new Error('Inventory analytics returned no data');

    return NextResponse.json({
      ...(data as unknown as Omit<InventoryAnalyticsResponse, 'currency'>),
      currency,
    });
  } catch (error) {
    console.error('Failed to load inventory analytics summary', error);
    return NextResponse.json(
      { message: 'Failed to load inventory analytics' },
      { status: 500 }
    );
  }
}

import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import { isInventoryRealtimeEnabled } from '@tuturuuu/inventory-core/realtime';
import {
  getInventorySalesPeriod,
  listInventoryCommerceSales,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  period_id: z.uuid().optional(),
  unassigned: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type InventorySaleListItem = {
  category_name?: string | null;
  completed_at: string | null;
  created_at: string | null;
  creator_name?: string | null;
  currency?: string | null;
  customer_name: string | null;
  id: string;
  items_count: number;
  note?: string | null;
  notice?: string | null;
  owners?: string[];
  paid_amount: number;
  period?: {
    id: string;
    name: string;
  } | null;
  polar_order_id?: string | null;
  public_token?: string | null;
  source: 'checkout_session' | 'finance_invoice';
  total_quantity: number;
  wallet_name?: string | null;
};

function normalizeFinanceSale(
  sale: Omit<InventorySaleListItem, 'source'> & {
    source?: InventorySaleListItem['source'];
  },
  workspaceCurrency: string
): InventorySaleListItem {
  return {
    ...sale,
    currency: sale.currency ?? workspaceCurrency,
    owners: sale.owners ?? [],
    source: 'finance_invoice',
  };
}

export async function GET(req: Request, { params }: Params) {
  await connection();
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    limit,
    offset,
    period_id: periodId,
    unassigned: unassignedOnly,
  } = parsed.data;
  if (periodId && unassignedOnly) {
    return NextResponse.json(
      { message: 'Choose either a period or unassigned sales' },
      { status: 400 }
    );
  }

  try {
    const [period, sales, realtimeEnabled, configuredCurrency] =
      await Promise.all([
        periodId
          ? getInventorySalesPeriod({ periodId, sbAdmin, wsId })
          : Promise.resolve(null),
        listInventoryCommerceSales({
          limit,
          offset,
          periodId,
          sbAdmin,
          unassignedOnly,
          wsId,
        }),
        isInventoryRealtimeEnabled(wsId),
        getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
      ]);
    if (periodId && !period) {
      return NextResponse.json(
        { message: 'Period not found' },
        { status: 404 }
      );
    }
    const workspaceCurrency = resolveSupportedCurrency(configuredCurrency);
    return NextResponse.json({
      count: sales.count,
      data: sales.data.map((sale) =>
        sale.source === 'finance_invoice'
          ? normalizeFinanceSale(sale, workspaceCurrency)
          : sale
      ),
      realtime_enabled: realtimeEnabled,
      workspace_currency: workspaceCurrency,
    });
  } catch (error) {
    console.error('Error fetching inventory sales', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales' },
      { status: 500 }
    );
  }
}

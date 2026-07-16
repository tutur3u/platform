import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { listCompletedCheckoutSales } from '@tuturuuu/inventory-core/commerce/checkouts';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import { isInventoryRealtimeEnabled } from '@tuturuuu/inventory-core/realtime';
import {
  getInventorySalesPeriod,
  getSalesPeriodAssignments,
  listInventorySalesForPeriod,
} from '@tuturuuu/inventory-core/sales-periods';
import { getInventorySales } from '@tuturuuu/inventory-core/sales-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  period_id: z.uuid().optional(),
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

function saleTimestamp(sale: InventorySaleListItem) {
  const timestamp = sale.completed_at ?? sale.created_at;
  if (!timestamp) return 0;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeFinanceSale(
  sale: Omit<InventorySaleListItem, 'source'> & {
    source?: InventorySaleListItem['source'];
  }
): InventorySaleListItem {
  return {
    ...sale,
    currency: sale.currency ?? null,
    owners: sale.owners ?? [],
    source: 'finance_invoice',
  };
}

export async function GET(req: Request, { params }: Params) {
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

  const { limit, offset, period_id: periodId } = parsed.data;
  if (periodId) {
    try {
      const [period, sales, realtimeEnabled] = await Promise.all([
        getInventorySalesPeriod({ periodId, sbAdmin, wsId }),
        listInventorySalesForPeriod({
          limit,
          offset,
          periodId,
          sbAdmin,
          wsId,
        }),
        isInventoryRealtimeEnabled(wsId),
      ]);
      if (!period) {
        return NextResponse.json(
          { message: 'Period not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        count: sales.count,
        data: sales.data.map((sale) => ({ ...sale, period })),
        realtime_enabled: realtimeEnabled,
      });
    } catch (error) {
      console.error('Error fetching inventory sales for period', error);
      return NextResponse.json(
        { message: 'Failed to fetch inventory sales' },
        { status: 500 }
      );
    }
  }

  const windowLimit = limit + offset;
  const [financeSalesResult, checkoutSalesResult, realtimeEnabled] =
    await Promise.all([
      getInventorySales<InventorySaleListItem>({
        limit: windowLimit,
        offset: 0,
        sbAdmin,
        wsId,
      })
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error })),
      listCompletedCheckoutSales({
        limit: windowLimit,
        offset: 0,
        sbAdmin,
        wsId,
      })
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error })),
      isInventoryRealtimeEnabled(wsId),
    ]);

  if (financeSalesResult.error || checkoutSalesResult.error) {
    console.error('Error fetching inventory sales', {
      checkoutSalesError: checkoutSalesResult.error,
      financeSalesError: financeSalesResult.error,
    });
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales' },
      { status: 500 }
    );
  }

  const merged = [
    ...(financeSalesResult.data?.data ?? []).map(normalizeFinanceSale),
    ...(checkoutSalesResult.data?.data ?? []),
  ]
    .sort((a, b) => saleTimestamp(b) - saleTimestamp(a))
    .slice(offset, offset + limit);
  let data: InventorySaleListItem[];
  try {
    const assignments = await getSalesPeriodAssignments({
      sales: merged,
      sbAdmin,
      wsId,
    });
    data = merged.map((sale) => ({
      ...sale,
      period: assignments.get(`${sale.source}:${sale.id}`) ?? null,
    }));
  } catch (error) {
    console.error('Error fetching inventory sales period assignments', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data,
    count:
      (financeSalesResult.data?.count ?? 0) +
      (checkoutSalesResult.data?.count ?? 0),
    realtime_enabled: realtimeEnabled,
  });
}

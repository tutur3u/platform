import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { createFinanceInvoice } from '@tuturuuu/internal-api/finance';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { safelyRevalidateWorkspaceStorefronts } from '@tuturuuu/inventory-core/commerce/public-storefront';
import {
  canCreateInventorySales,
  canViewInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import { isInventoryRealtimeEnabled } from '@tuturuuu/inventory-core/realtime';
import {
  getInventorySalesPeriod,
  listInventoryCommerceSales,
  setInventorySalePeriod,
} from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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

const SaleProductSchema = z.object({
  category_id: z.uuid(),
  price: z.number().finite().nonnegative(),
  product_id: z.uuid(),
  quantity: z.number().finite().positive(),
  unit_id: z.uuid(),
  warehouse_id: z.uuid(),
});

const CreateSaleSchema = z.object({
  category_id: z.uuid(),
  content: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2_000).optional(),
  period_id: z.uuid().nullable().optional(),
  products: z.array(SaleProductSchema).min(1).max(500),
  wallet_id: z.uuid(),
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
  finance_reconciliation_href?: string | null;
  finance_status?: 'linked' | 'pending' | 'refunded' | 'disputed' | null;
  finance_transaction_id?: string | null;
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

type FinanceEntryRow = {
  amount_minor: number;
  checkout_session_id: string;
  entry_kind: string;
  id: string;
  reconciliation_status: string;
  wallet_transaction_id: string | null;
};

async function enrichCheckoutFinanceStatus({
  sales,
  sbAdmin,
  wsId,
}: {
  sales: InventorySaleListItem[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const checkoutIds = sales
    .filter((sale) => sale.source === 'checkout_session')
    .map((sale) => sale.id);
  if (checkoutIds.length === 0) return sales;
  if (typeof sbAdmin.schema !== 'function') return sales;
  const { data, error } = (await sbAdmin
    .schema('private' as never)
    .from('inventory_finance_entries' as never)
    .select(
      'id, checkout_session_id, entry_kind, amount_minor, reconciliation_status, wallet_transaction_id'
    )
    .eq('ws_id' as never, wsId)
    .in('checkout_session_id' as never, checkoutIds)) as unknown as {
    data: FinanceEntryRow[] | null;
    error: { message?: string } | null;
  };
  if (error) throw error;
  const byCheckout = Map.groupBy(
    data ?? [],
    (entry) => entry.checkout_session_id
  );
  const financeOrigin =
    process.env.NODE_ENV === 'production'
      ? 'https://finance.tuturuuu.com'
      : 'https://finance.tuturuuu.localhost';
  return sales.map((sale) => {
    if (sale.source !== 'checkout_session') return sale;
    const entries = byCheckout.get(sale.id) ?? [];
    const saleEntry = entries.find((entry) => entry.entry_kind === 'sale');
    const holdTotal = entries
      .filter((entry) => entry.entry_kind === 'chargeback_hold')
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    const releaseTotal = entries
      .filter((entry) => entry.entry_kind === 'chargeback_release')
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    const hasRefund = entries.some((entry) => entry.entry_kind === 'refund');
    const financeStatus =
      holdTotal + releaseTotal < 0
        ? 'disputed'
        : hasRefund
          ? 'refunded'
          : saleEntry?.reconciliation_status === 'linked'
            ? 'linked'
            : 'pending';
    return {
      ...sale,
      finance_reconciliation_href: saleEntry?.wallet_transaction_id
        ? `${financeOrigin}/${wsId}/transactions/${saleEntry.wallet_transaction_id}`
        : `${financeOrigin}/${wsId}/transactions?reconciliation=${saleEntry?.id ?? sale.id}`,
      finance_status: financeStatus,
      finance_transaction_id: saleEntry?.wallet_transaction_id ?? null,
    } satisfies InventorySaleListItem;
  });
}

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
    const normalizedSales = sales.data.map((sale) =>
      sale.source === 'finance_invoice'
        ? normalizeFinanceSale(sale, workspaceCurrency)
        : sale
    );
    return NextResponse.json({
      count: sales.count,
      data: await enrichCheckoutFinanceStatus({
        sales: normalizedSales,
        sbAdmin,
        wsId,
      }),
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

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, userId, wsId } = authorization.value;
  if (!canCreateInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = CreateSaleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid sale', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { period_id: periodId, ...payload } = parsed.data;

  try {
    const result = await createFinanceInvoice(
      wsId,
      {
        ...payload,
        customer_id: null,
        price_mode: 'custom',
      },
      withForwardedInternalApiAuth(req.headers)
    );

    let periodAssignmentWarning: string | undefined;
    if (periodId) {
      try {
        const period = await setInventorySalePeriod({
          actorId: userId,
          periodId,
          saleId: result.invoice_id,
          saleSource: 'finance_invoice',
          sbAdmin: await createAdminClient(),
          wsId,
        });
        if (!period) periodAssignmentWarning = 'Sales period was not found';
      } catch (error) {
        console.warn('Sale created but period assignment failed', error);
        periodAssignmentWarning =
          'Sale was created, but its sales period could not be assigned';
      }
    }

    await safelyRevalidateWorkspaceStorefronts(wsId);

    return NextResponse.json(
      {
        ...result,
        period_assignment_warning: periodAssignmentWarning,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof InternalApiError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error creating inventory sale', error);
    return NextResponse.json(
      { message: 'Failed to create inventory sale' },
      { status: 500 }
    );
  }
}

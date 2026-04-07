import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';
import { canViewInventorySales } from '@/lib/inventory/permissions';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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

  const { limit, offset } = parsed.data;
  const [invoicesResult, realtimeEnabled] = await Promise.all([
    sbAdmin
      .from('finance_invoices')
      .select(
        'id, notice, note, paid_amount, created_at, completed_at, wallet:workspace_wallets(name), category:transaction_categories(name), customer:workspace_users!finance_invoices_customer_id_fkey(full_name), creator:workspace_users!finance_invoices_creator_id_fkey(full_name), platform_creator:users!finance_invoices_platform_creator_id_fkey(display_name), finance_invoice_products!inner(amount, price, owner_id, owner_name, product_id, product_name)',
        { count: 'exact' }
      )
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    isInventoryRealtimeEnabled(wsId),
  ]);

  if (invoicesResult.error) {
    console.error('Error fetching inventory sales', invoicesResult.error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sales' },
      { status: 500 }
    );
  }

  const data = (invoicesResult.data ?? []).map((invoice) => {
    const wallet = Array.isArray(invoice.wallet)
      ? invoice.wallet[0]
      : invoice.wallet;
    const category = Array.isArray(invoice.category)
      ? invoice.category[0]
      : invoice.category;
    const customer = Array.isArray(invoice.customer)
      ? invoice.customer[0]
      : invoice.customer;
    const creator = Array.isArray(invoice.creator)
      ? invoice.creator[0]
      : invoice.creator;
    const platformCreator = Array.isArray(invoice.platform_creator)
      ? invoice.platform_creator[0]
      : invoice.platform_creator;
    const lines = Array.isArray(invoice.finance_invoice_products)
      ? invoice.finance_invoice_products
      : [];

    return {
      id: invoice.id,
      notice: invoice.notice,
      note: invoice.note,
      paid_amount: invoice.paid_amount,
      created_at: invoice.created_at,
      completed_at: invoice.completed_at,
      wallet_name: wallet?.name ?? null,
      category_name: category?.name ?? null,
      customer_name: customer?.full_name ?? null,
      creator_name: creator?.full_name ?? platformCreator?.display_name ?? null,
      items_count: lines.length,
      total_quantity: lines.reduce(
        (sum, line) => sum + Number(line.amount ?? 0),
        0
      ),
      owners: [
        ...new Set(lines.map((line) => line.owner_name ?? 'Unassigned')),
      ],
    };
  });

  return NextResponse.json({
    data,
    count: invoicesResult.count ?? data.length,
    realtime_enabled: realtimeEnabled,
  });
}

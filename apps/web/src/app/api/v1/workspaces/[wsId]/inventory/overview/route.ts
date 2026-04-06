import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  canViewInventoryAnalytics,
  canViewInventoryDashboard,
  canViewInventorySales,
  canViewInventoryStock,
} from '@/lib/inventory/permissions';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

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
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const canViewStock = canViewInventoryStock(permissions);
  const canViewSales = canViewInventorySales(permissions);
  const canViewAnalytics = canViewInventoryAnalytics(permissions);

  const [
    walletsResult,
    transactionsResult,
    lowStockResult,
    invoicesResult,
    salesLinesResult,
    realtimeEnabled,
  ] = await Promise.all([
    sbAdmin.from('workspace_wallets').select('id').eq('ws_id', wsId),
    canViewAnalytics
      ? sbAdmin
          .from('wallet_transactions')
          .select('amount, wallet:workspace_wallets!inner(ws_id)')
          .eq('wallet.ws_id', wsId)
      : Promise.resolve({ data: [], error: null }),
    canViewStock
      ? sbAdmin
          .from('inventory_products')
          .select(
            'amount, min_amount, price, warehouse_id, unit_id, workspace_products!inner(id, name, ws_id, archived, owner_id, inventory_owners(name), product_categories(name)), inventory_units!inventory_products_unit_id_fkey(name), inventory_warehouses!inventory_products_warehouse_id_fkey(name)'
          )
          .eq('workspace_products.ws_id', wsId)
          .eq('workspace_products.archived', false)
      : Promise.resolve({ data: [], error: null }),
    canViewSales
      ? sbAdmin
          .from('finance_invoices')
          .select(
            'id, paid_amount, completed_at, created_at, category_id, wallet_id, wallet:workspace_wallets(name), category:transaction_categories(name), customer:workspace_users!finance_invoices_customer_id_fkey(full_name), creator:workspace_users!finance_invoices_creator_id_fkey(full_name), platform_creator:users!finance_invoices_platform_creator_id_fkey(display_name), finance_invoice_products!inner(amount, price, owner_id, owner_name, product_id, product_name)'
          )
          .eq('ws_id', wsId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    canViewAnalytics
      ? sbAdmin
          .from('finance_invoice_products')
          .select(
            'amount, price, owner_id, owner_name, product_name, product_id, finance_invoices!inner(ws_id, created_at, category_id), workspace_products(product_categories(name))'
          )
          .eq('finance_invoices.ws_id', wsId)
      : Promise.resolve({ data: [], error: null }),
    isInventoryRealtimeEnabled(wsId),
  ]);

  if (
    walletsResult.error ||
    transactionsResult.error ||
    lowStockResult.error ||
    invoicesResult.error ||
    salesLinesResult.error
  ) {
    console.error('Error fetching inventory overview', {
      walletsError: walletsResult.error,
      transactionsError: transactionsResult.error,
      lowStockError: lowStockResult.error,
      invoicesError: invoicesResult.error,
      salesLinesError: salesLinesResult.error,
    });
    return NextResponse.json(
      { message: 'Failed to load inventory overview' },
      { status: 500 }
    );
  }

  const transactions = transactionsResult.data ?? [];
  const totalIncome = transactions.reduce((sum, row) => {
    const amount = Number(row.amount ?? 0);
    return amount > 0 ? sum + amount : sum;
  }, 0);
  const totalExpense = transactions.reduce((sum, row) => {
    const amount = Number(row.amount ?? 0);
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);

  const lowStockProducts = (lowStockResult.data ?? [])
    .filter(
      (row) =>
        row.amount != null && Number(row.amount) <= Number(row.min_amount ?? 0)
    )
    .map((row) => {
      const workspaceProduct = Array.isArray(row.workspace_products)
        ? row.workspace_products[0]
        : row.workspace_products;
      const owner = Array.isArray(workspaceProduct?.inventory_owners)
        ? workspaceProduct.inventory_owners[0]
        : workspaceProduct?.inventory_owners;
      const category = Array.isArray(workspaceProduct?.product_categories)
        ? workspaceProduct.product_categories[0]
        : workspaceProduct?.product_categories;
      const unit = Array.isArray(row.inventory_units)
        ? row.inventory_units[0]
        : row.inventory_units;
      const warehouse = Array.isArray(row.inventory_warehouses)
        ? row.inventory_warehouses[0]
        : row.inventory_warehouses;

      return {
        product_id: workspaceProduct?.id ?? null,
        product_name: workspaceProduct?.name ?? null,
        owner_name: owner?.name ?? null,
        category_name: category?.name ?? null,
        amount: row.amount,
        min_amount: row.min_amount,
        price: row.price,
        unit_name: unit?.name ?? null,
        warehouse_name: warehouse?.name ?? null,
      };
    });

  const salesLines = salesLinesResult.data ?? [];
  const ownerBreakdown = new Map<string, Record<string, unknown>>();
  const categoryBreakdown = new Map<string, Record<string, unknown>>();

  for (const line of salesLines) {
    const amount = Number(line.amount ?? 0);
    const price = Number(line.price ?? 0);
    const revenue = amount * price;
    const ownerKey =
      typeof line.owner_id === 'string' && line.owner_id.trim().length > 0
        ? line.owner_id
        : 'unassigned';
    const ownerName =
      typeof line.owner_name === 'string' && line.owner_name.trim().length > 0
        ? line.owner_name
        : 'Unassigned';
    const ownerEntry = ownerBreakdown.get(ownerKey) ?? {
      owner_id: line.owner_id ?? null,
      owner_name: ownerName,
      revenue: 0,
      quantity: 0,
    };
    ownerEntry.revenue = Number(ownerEntry.revenue ?? 0) + revenue;
    ownerEntry.quantity = Number(ownerEntry.quantity ?? 0) + amount;
    ownerBreakdown.set(ownerKey, ownerEntry);

    const workspaceProduct = Array.isArray(line.workspace_products)
      ? line.workspace_products[0]
      : line.workspace_products;
    const productCategory = Array.isArray(workspaceProduct?.product_categories)
      ? workspaceProduct.product_categories[0]
      : workspaceProduct?.product_categories;
    const categoryName =
      typeof productCategory?.name === 'string' &&
      productCategory.name.trim().length > 0
        ? productCategory.name
        : 'Uncategorized';
    const categoryEntry = categoryBreakdown.get(categoryName) ?? {
      category_name: categoryName,
      revenue: 0,
      quantity: 0,
    };
    categoryEntry.revenue = Number(categoryEntry.revenue ?? 0) + revenue;
    categoryEntry.quantity = Number(categoryEntry.quantity ?? 0) + amount;
    categoryBreakdown.set(categoryName, categoryEntry);
  }

  const recentSales = (invoicesResult.data ?? []).map((invoice) => {
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
      created_at: invoice.created_at,
      completed_at: invoice.completed_at,
      paid_amount: invoice.paid_amount,
      wallet_name: wallet?.name ?? null,
      category_name: category?.name ?? null,
      customer_name: customer?.full_name ?? null,
      creator_name: creator?.full_name ?? platformCreator?.display_name ?? null,
      items_count: lines.length,
      owners: [
        ...new Set(lines.map((line) => line.owner_name ?? 'Unassigned')),
      ],
    };
  });

  return NextResponse.json({
    realtime_enabled: realtimeEnabled,
    totals: {
      wallets_count: walletsResult.data?.length ?? 0,
      total_income: totalIncome,
      total_expense: totalExpense,
      inventory_sales_revenue: [...ownerBreakdown.values()].reduce(
        (sum, entry) => sum + Number(entry.revenue ?? 0),
        0
      ),
      inventory_sales_count: recentSales.length,
    },
    low_stock_products: lowStockProducts,
    recent_sales: recentSales,
    owner_breakdown: [...ownerBreakdown.values()],
    category_breakdown: [...categoryBreakdown.values()],
  });
}

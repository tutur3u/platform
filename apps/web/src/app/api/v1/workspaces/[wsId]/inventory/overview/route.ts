import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canViewInventoryAnalytics,
  canViewInventoryDashboard,
  canViewInventorySales,
  canViewInventoryStock,
} from '@/lib/inventory/permissions';
import {
  getInventoryLowStockProducts,
  getInventoryOverviewMetrics,
} from '@/lib/inventory/product-rpc';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const { permissions, wsId } = authorization.value;

  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const canViewStock = canViewInventoryStock(permissions);
  const canViewSales = canViewInventorySales(permissions);
  const canViewAnalytics = canViewInventoryAnalytics(permissions);

  const [lowStockResult, metricsResult, realtimeEnabled] = await Promise.all([
    canViewStock
      ? getInventoryLowStockProducts({ sbAdmin, wsId })
          .then((data) => ({ data, error: null }))
          .catch((error) => ({ data: [], error }))
      : Promise.resolve({ data: [], error: null }),
    canViewSales || canViewAnalytics
      ? getInventoryOverviewMetrics({ sbAdmin, wsId })
          .then((data) => ({ data, error: null }))
          .catch((error) => ({ data: null, error }))
      : Promise.resolve({ data: null, error: null }),
    isInventoryRealtimeEnabled(wsId),
  ]);

  if (lowStockResult.error || metricsResult.error) {
    serverLogger.error('Error fetching inventory overview', {
      lowStockError: lowStockResult.error,
      metricsError: metricsResult.error,
    });
    return NextResponse.json(
      { message: 'Failed to load inventory overview' },
      { status: 500 }
    );
  }

  const lowStockProducts = lowStockResult.data ?? [];
  const metrics = metricsResult.data;
  const recentSales = canViewSales ? (metrics?.recent_sales ?? []) : [];
  const ownerBreakdown = canViewAnalytics
    ? (metrics?.owner_breakdown ?? [])
    : [];
  const categoryBreakdown = canViewAnalytics
    ? (metrics?.category_breakdown ?? [])
    : [];

  return NextResponse.json({
    realtime_enabled: realtimeEnabled,
    totals: {
      wallets_count: metrics?.wallets_count ?? 0,
      total_income: canViewAnalytics ? (metrics?.total_income ?? 0) : 0,
      total_expense: canViewAnalytics ? (metrics?.total_expense ?? 0) : 0,
      inventory_sales_revenue: canViewAnalytics
        ? (metrics?.inventory_sales_revenue ?? 0)
        : 0,
      inventory_sales_count: recentSales.length,
    },
    low_stock_products: lowStockProducts,
    recent_sales: recentSales,
    owner_breakdown: ownerBreakdown,
    category_breakdown: categoryBreakdown,
  });
}

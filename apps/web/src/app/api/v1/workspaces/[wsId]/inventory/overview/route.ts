import type { InventoryDashboardSnapshot } from '@tuturuuu/internal-api';
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
  getInventoryDashboardSnapshot,
  getInventoryLowStockProducts,
  getInventoryOverviewMetrics,
} from '@/lib/inventory/product-rpc';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function dashboardForPermissions({
  canViewAnalytics,
  canViewSales,
  canViewStock,
  dashboard,
}: {
  canViewAnalytics: boolean;
  canViewSales: boolean;
  canViewStock: boolean;
  dashboard: InventoryDashboardSnapshot | null;
}) {
  if (!dashboard) return null;

  return {
    ...dashboard,
    analytics: canViewAnalytics
      ? dashboard.analytics
      : {
          categoryMix: [],
          ownerMix: [],
          revenueTrend: [],
        },
    costing: canViewAnalytics
      ? dashboard.costing
      : {
          ...dashboard.costing,
          averageMarginPercentage: 0,
          bestScenario: null,
          lowestBreakEvenQuantity: null,
          weakestScenario: null,
        },
    counts: {
      ...dashboard.counts,
      lowStock: canViewStock ? dashboard.counts.lowStock : 0,
      sales: canViewSales ? dashboard.counts.sales : 0,
      stockRows: canViewStock ? dashboard.counts.stockRows : 0,
    },
    actions: canViewStock
      ? dashboard.actions
      : dashboard.actions.filter(
          (action) =>
            action.view !== 'stock' && action.kind !== 'resolve_low_stock'
        ),
    readiness: canViewStock
      ? dashboard.readiness
      : dashboard.readiness.map((item) =>
          item.key === 'products'
            ? {
                ...item,
                completed: dashboard.counts.products > 0 ? 1 : 0,
                score: dashboard.counts.products > 0 ? 100 : 0,
                total: 1,
              }
            : item
        ),
    risks: dashboard.risks.filter((risk) => {
      if (!canViewSales && risk.kind === 'stale_checkout') return false;
      if (
        !canViewStock &&
        (risk.view === 'stock' || risk.kind === 'low_stock')
      ) {
        return false;
      }

      return true;
    }),
  };
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

  const [dashboardResult, lowStockResult, metricsResult, realtimeEnabled] =
    await Promise.all([
      getInventoryDashboardSnapshot({ sbAdmin, wsId })
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error })),
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

  if (dashboardResult.error) {
    serverLogger.error('Error fetching inventory dashboard snapshot', {
      dashboardError: dashboardResult.error,
    });
  }

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
    dashboard: dashboardForPermissions({
      canViewAnalytics,
      canViewSales,
      canViewStock,
      dashboard: dashboardResult.data,
    }),
  });
}

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

interface Params {
  wsId: string;
  module: string;
}

// Map module names to database table names
const MODULE_TABLE_MAP: Record<string, string> = {
  // Inventory tables
  'inventory-products': 'inventory_products',
  'inventory-suppliers': 'inventory_suppliers',
  'inventory-batches': 'inventory_batches',
  'inventory-batch-products': 'inventory_batch_products',
  warehouses: 'inventory_warehouses',
  'product-categories': 'product_categories',
  'product-units': 'inventory_units',
  'transaction-categories': 'transaction_categories',
  // Finance tables
  'finance-budgets': 'finance_budgets',
  'finance-invoices': 'finance_invoices',
  'finance-invoice-products': 'finance_invoice_products',
  'finance-invoice-promotions': 'finance_invoice_promotions',
  // Wallet tables
  'credit-wallets': 'credit_wallets',
  'wallet-types': 'wallet_types',
  'wallet-transaction-tags': 'wallet_transaction_tags',
  'workspace-wallets': 'workspace_wallets',
  'workspace-wallet-transfers': 'workspace_wallet_transfers',
  // Workspace user tables
  'workspace-users': 'workspace_users',
  'workspace-user-fields': 'workspace_user_fields',
  'workspace-user-groups': 'workspace_user_groups',
  'workspace-user-groups-users': 'workspace_user_groups_users',
  'workspace-user-group-tags': 'workspace_user_group_tags',
  'workspace-user-group-tag-groups': 'workspace_user_group_tag_groups',
  'workspace-user-linked-users': 'workspace_user_linked_users',
  'workspace-user-status-changes': 'workspace_user_status_changes',
  // Legacy mappings
  'payment-methods': 'wallet_types',
  roles: 'workspace_roles',
  users: 'workspace_users',
  classes: 'workspace_user_groups',
  packages: 'workspace_products',
  coupons: 'workspace_promotions',
  wallets: 'workspace_wallets',
  bills: 'finance_invoices',
  'bill-packages': 'finance_invoice_products',
  'bill-coupons': 'finance_invoice_promotions',
  'user-coupons': 'user_linked_promotions',
  lessons: 'user_group_posts',
  'score-names': 'healthcare_vitals', // Indicator definitions
  'grouped-score-names': 'healthcare_vitals', // Also maps to healthcare_vitals
  'class-scores': 'user_indicators', // Maps to user_indicators (user_id, indicator_id, value)
  'class-members': 'workspace_user_groups_users',
  'user-group-users': 'workspace_user_groups_users',
  'class-packages': 'user_group_linked_products',
  'class-attendance': 'user_group_attendance',
  'student-feedbacks': 'user_feedbacks',
  'package-stock-changes': 'product_stock_changes',
  'user-monthly-reports': 'external_user_monthly_reports',
  'user-monthly-report-logs': 'external_user_monthly_report_logs',
  'user-status-changes': 'workspace_user_status_changes',
  'wallet-transactions': 'wallet_transactions',
  'workspace-settings': 'workspace_settings',
  'workspace-configs': 'workspace_configs',
};

// Tables that need special handling for workspace scoping
const WORKSPACE_COLUMN_MAP: Record<string, string> = {
  // Inventory tables
  // Note: inventory_products, inventory_batches, inventory_batch_products don't have ws_id
  // They're queried via warehouse join (handled separately)
  inventory_suppliers: 'ws_id',
  inventory_warehouses: 'ws_id',
  product_categories: 'ws_id',
  inventory_units: 'ws_id',
  transaction_categories: 'ws_id',
  // Finance tables
  finance_budgets: 'ws_id',
  finance_invoices: 'ws_id',
  finance_invoice_products: 'ws_id',
  finance_invoice_promotions: 'ws_id',
  // Wallet tables
  credit_wallets: 'ws_id',
  wallet_types: 'ws_id',
  wallet_transaction_tags: 'ws_id',
  workspace_wallets: 'ws_id',
  workspace_wallet_transfers: 'ws_id',
  // Workspace user tables
  workspace_users: 'ws_id',
  workspace_user_fields: 'ws_id',
  workspace_user_groups: 'ws_id',
  // Junction tables: workspace_user_groups_users and workspace_user_group_tag_groups
  // don't have ws_id - they're queried via joins (handled separately)
  workspace_user_group_tags: 'ws_id',
  workspace_user_linked_users: 'ws_id',
  workspace_user_status_changes: 'ws_id',
  // Other tables
  workspace_roles: 'ws_id',
  workspace_products: 'ws_id',
  workspace_promotions: 'ws_id',
  user_linked_promotions: 'ws_id',
  user_group_posts: 'ws_id',
  healthcare_vitals: 'ws_id', // Indicator definitions (score-names)
  user_indicators: 'ws_id', // Indicator values (class-scores)
  user_group_linked_products: 'ws_id',
  user_group_attendance: 'ws_id',
  user_feedbacks: 'ws_id',
  product_stock_changes: 'ws_id',
  external_user_monthly_reports: 'ws_id',
  external_user_monthly_report_logs: 'ws_id',
  wallet_transactions: 'ws_id',
  workspace_settings: 'ws_id',
  workspace_configs: 'ws_id',
};

/**
 * GET /api/v2/workspaces/[wsId]/migrate/[module]
 *
 * Returns paginated data from a workspace for migration purposes.
 * Requires valid API key with Bearer authentication.
 *
 * Query params:
 * - from: Offset for pagination (default: 0)
 * - limit: Number of records to return (default: 500, max: 1000)
 *
 * @returns { count: number, data: unknown[] }
 */
export const GET = withApiAuth<Params>(
  async (request, { params, context }) => {
    const { wsId, module } = params;

    // Verify the requested workspace matches the API key's workspace
    if (context.wsId !== wsId) {
      return createErrorResponse(
        'Forbidden',
        'API key does not have access to this workspace',
        403,
        'WORKSPACE_MISMATCH'
      );
    }

    // Validate module
    const tableName = MODULE_TABLE_MAP[module];
    if (!tableName) {
      return createErrorResponse(
        'Bad Request',
        `Unknown migration module: ${module}`,
        400,
        'UNKNOWN_MODULE'
      );
    }

    // Parse pagination params
    const url = new URL(request.url);
    const from = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10));
    const limit = Math.min(
      1000,
      Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10))
    );

    // Use admin client for SDK API routes
    const supabase = await createDynamicAdminClient();

    // Tables without ws_id need special handling via joins
    const tablesWithoutWsId: Record<
      string,
      { parentTable: string; joinColumn: string }
    > = {
      // Junction tables
      workspace_user_groups_users: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      workspace_user_group_tag_groups: {
        parentTable: 'workspace_user_group_tags',
        joinColumn: 'tag_id',
      },
      // Inventory tables without ws_id - query via warehouse
      inventory_products: {
        parentTable: 'inventory_warehouses',
        joinColumn: 'warehouse_id',
      },
      inventory_batches: {
        parentTable: 'inventory_warehouses',
        joinColumn: 'warehouse_id',
      },
    };

    // inventory_batch_products needs two-level join (batch -> warehouse)
    if (tableName === 'inventory_batch_products') {
      // First get warehouse IDs
      const { data: warehouses, error: warehouseError } = await supabase
        .from('inventory_warehouses')
        .select('id')
        .eq('ws_id', wsId);

      if (warehouseError) {
        console.error('Error fetching warehouses:', warehouseError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch warehouses: ${warehouseError.message}`,
          500,
          'WAREHOUSE_FETCH_ERROR'
        );
      }

      const warehouseIds = warehouses?.map((w) => w.id) ?? [];

      if (warehouseIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Get batch IDs for these warehouses
      const { data: batches, error: batchError } = await supabase
        .from('inventory_batches')
        .select('id')
        .in('warehouse_id', warehouseIds);

      if (batchError) {
        console.error('Error fetching batches:', batchError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch batches: ${batchError.message}`,
          500,
          'BATCH_FETCH_ERROR'
        );
      }

      const batchIds = batches?.map((b) => b.id) ?? [];

      if (batchIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Count and fetch batch products
      const { count: totalCount, error: countError } = await supabase
        .from('inventory_batch_products')
        .select('*', { count: 'exact', head: true })
        .in('batch_id', batchIds);

      if (countError) {
        console.error('Error counting inventory_batch_products:', countError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to count records: ${countError.message}`,
          500,
          'COUNT_ERROR'
        );
      }

      const { data, error } = await supabase
        .from('inventory_batch_products')
        .select('*')
        .in('batch_id', batchIds)
        .range(from, from + limit - 1);

      if (error) {
        console.error('Error fetching inventory_batch_products:', error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount ?? 0,
        data: data ?? [],
      });
    }

    const joinConfig = tablesWithoutWsId[tableName];

    if (joinConfig) {
      // For tables without ws_id, query via join with parent table
      // First get parent IDs that belong to this workspace
      const { data: parentData, error: parentError } = await supabase
        .from(joinConfig.parentTable as 'workspace_user_groups')
        .select('id')
        .eq('ws_id', wsId);

      if (parentError) {
        console.error(
          `Error fetching parent ${joinConfig.parentTable}:`,
          parentError
        );
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch parent records: ${parentError.message}`,
          500,
          'PARENT_FETCH_ERROR'
        );
      }

      const parentIds = parentData?.map((p) => p.id) ?? [];

      if (parentIds.length === 0) {
        return NextResponse.json({
          count: 0,
          data: [],
        });
      }

      // Count records via join
      const { count: totalCount, error: countError } = await supabase
        .from(tableName as 'workspace_user_groups_users')
        .select('*', { count: 'exact', head: true })
        .in(joinConfig.joinColumn, parentIds);

      if (countError) {
        console.error(`Error counting ${tableName}:`, countError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to count records: ${countError.message}`,
          500,
          'COUNT_ERROR'
        );
      }

      // Fetch paginated data via join
      const { data, error } = await supabase
        .from(tableName as 'workspace_user_groups_users')
        .select('*')
        .in(joinConfig.joinColumn, parentIds)
        .range(from, from + limit - 1);

      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount ?? 0,
        data: data ?? [],
      });
    }

    // Get workspace column name for this table
    const wsColumn = WORKSPACE_COLUMN_MAP[tableName] || 'ws_id';

    // First get total count
    const { count: totalCount, error: countError } = await supabase
      .from(tableName as 'workspace_users')
      .select('*', { count: 'exact', head: true })
      .eq(wsColumn, wsId);

    if (countError) {
      console.error(`Error counting ${tableName}:`, countError);
      return createErrorResponse(
        'Internal Server Error',
        `Failed to count records: ${countError.message}`,
        500,
        'COUNT_ERROR'
      );
    }

    // Fetch paginated data
    const { data, error } = await supabase
      .from(tableName as 'workspace_users')
      .select('*')
      .eq(wsColumn, wsId)
      .range(from, from + limit - 1);

    if (error) {
      console.error(`Error fetching ${tableName}:`, error);
      return createErrorResponse(
        'Internal Server Error',
        `Failed to fetch records: ${error.message}`,
        500,
        'FETCH_ERROR'
      );
    }

    return NextResponse.json({
      count: totalCount ?? 0,
      data: data ?? [],
    });
  },
  {
    // No specific permissions required - just needs valid API key for the workspace
  }
);

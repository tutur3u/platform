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
  inventory_products: 'ws_id',
  inventory_suppliers: 'ws_id',
  inventory_batches: 'ws_id',
  inventory_batch_products: 'ws_id',
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
  workspace_user_groups_users: 'ws_id',
  workspace_user_group_tags: 'ws_id',
  workspace_user_group_tag_groups: 'ws_id',
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

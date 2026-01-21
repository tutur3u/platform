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

// Tables that have ws_id column for direct workspace scoping
const TABLES_WITH_WS_ID: Set<string> = new Set([
  // Inventory tables
  'inventory_suppliers',
  'inventory_warehouses',
  'product_categories',
  'inventory_units',
  'transaction_categories',
  // Finance tables
  'finance_budgets',
  'finance_invoices',
  // Wallet tables
  'workspace_wallets',
  // Workspace user tables
  'workspace_users',
  'workspace_user_fields',
  'workspace_user_groups',
  'workspace_user_group_tags',
  'workspace_user_linked_users',
  'workspace_user_status_changes',
  // Other tables
  'workspace_roles',
  'workspace_products',
  'workspace_promotions',
  'healthcare_vitals', // Indicator definitions (score-names)
  'workspace_settings',
  'workspace_configs',
]);

// Tables without workspace scoping (global lookup tables)
const GLOBAL_TABLES: Set<string> = new Set([
  'wallet_types', // Just has 'id', no ws_id
]);

// Maximum number of IDs to use in a single .in() query
// PostgREST/Supabase has limits on query size
const MAX_IN_BATCH_SIZE = 500;

/**
 * Helper to batch .in() queries for large ID arrays
 * Supabase/PostgREST has limits on .in() clause size
 */
async function batchedInQuery<T>(
  supabase: Awaited<ReturnType<typeof createDynamicAdminClient>>,
  tableName: string,
  columnName: string,
  ids: string[],
  options: {
    countOnly?: boolean;
    from?: number;
    limit?: number;
  } = {}
): Promise<{ count: number; data: T[]; error: Error | null }> {
  const { countOnly = false, from = 0, limit = 500 } = options;

  if (ids.length === 0) {
    return { count: 0, data: [], error: null };
  }

  // If IDs fit in one batch, do a simple query
  if (ids.length <= MAX_IN_BATCH_SIZE) {
    if (countOnly) {
      const { count, error } = await supabase
        .from(tableName as 'workspace_users')
        .select('*', { count: 'exact', head: true })
        .in(columnName, ids);
      return { count: count ?? 0, data: [], error: error as Error | null };
    }

    const { data, count, error } = await supabase
      .from(tableName as 'workspace_users')
      .select('*', { count: 'exact' })
      .in(columnName, ids)
      .range(from, from + limit - 1);
    return {
      count: count ?? 0,
      data: (data ?? []) as T[],
      error: error as Error | null,
    };
  }

  // For large ID arrays, batch the queries
  let totalCount = 0;

  // First, get the total count by batching count queries
  for (let i = 0; i < ids.length; i += MAX_IN_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + MAX_IN_BATCH_SIZE);
    const { count, error } = await supabase
      .from(tableName as 'workspace_users')
      .select('*', { count: 'exact', head: true })
      .in(columnName, batchIds);

    if (error) {
      return { count: 0, data: [], error: error as Error };
    }
    totalCount += count ?? 0;
  }

  if (countOnly) {
    return { count: totalCount, data: [], error: null };
  }

  // For data fetching with pagination, we need to handle it differently
  // We'll fetch from batches until we have enough records
  const allData: T[] = [];
  let recordsToSkip = from;
  let recordsNeeded = limit;

  for (let i = 0; i < ids.length && recordsNeeded > 0; i += MAX_IN_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + MAX_IN_BATCH_SIZE);

    // First check how many records this batch has
    const { count: batchCount } = await supabase
      .from(tableName as 'workspace_users')
      .select('*', { count: 'exact', head: true })
      .in(columnName, batchIds);

    const batchRecordCount = batchCount ?? 0;

    if (recordsToSkip >= batchRecordCount) {
      // Skip this entire batch
      recordsToSkip -= batchRecordCount;
      continue;
    }

    // Fetch from this batch
    const { data, error } = await supabase
      .from(tableName as 'workspace_users')
      .select('*')
      .in(columnName, batchIds)
      .range(recordsToSkip, recordsToSkip + recordsNeeded - 1);

    if (error) {
      return { count: totalCount, data: allData, error: error as Error };
    }

    allData.push(...((data ?? []) as T[]));
    recordsNeeded -= (data ?? []).length;
    recordsToSkip = 0; // After first partial batch, start from 0
  }

  return { count: totalCount, data: allData, error: null };
}

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

    // Handle global tables (no workspace scoping needed)
    if (GLOBAL_TABLES.has(tableName)) {
      const { count: totalCount, error: countError } = await supabase
        .from(tableName as 'wallet_types')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error(`Error counting ${tableName}:`, countError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to count records: ${countError.message}`,
          500,
          'COUNT_ERROR'
        );
      }

      const { data, error } = await supabase
        .from(tableName as 'wallet_types')
        .select('*')
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
      // Product stock changes - query via warehouse
      product_stock_changes: {
        parentTable: 'inventory_warehouses',
        joinColumn: 'warehouse_id',
      },
      // Finance invoice related - query via invoice
      finance_invoice_products: {
        parentTable: 'finance_invoices',
        joinColumn: 'invoice_id',
      },
      finance_invoice_promotions: {
        parentTable: 'finance_invoices',
        joinColumn: 'invoice_id',
      },
      // Wallet related - query via workspace_wallets
      credit_wallets: {
        parentTable: 'workspace_wallets',
        joinColumn: 'wallet_id',
      },
      // User group related - query via workspace_user_groups
      user_group_posts: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      user_group_linked_products: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      user_group_attendance: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      external_user_monthly_reports: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      external_user_monthly_report_logs: {
        parentTable: 'workspace_user_groups',
        joinColumn: 'group_id',
      },
      // User related - query via workspace_users
      user_linked_promotions: {
        parentTable: 'workspace_users',
        joinColumn: 'user_id',
      },
      user_indicators: {
        parentTable: 'workspace_users',
        joinColumn: 'user_id',
      },
      user_feedbacks: {
        parentTable: 'workspace_users',
        joinColumn: 'user_id',
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

      // Get all batch IDs for these warehouses (batch the warehouse IDs query)
      const batchIds: string[] = [];
      for (let i = 0; i < warehouseIds.length; i += MAX_IN_BATCH_SIZE) {
        const batchWarehouseIds = warehouseIds.slice(i, i + MAX_IN_BATCH_SIZE);
        const { data: batches, error: batchError } = await supabase
          .from('inventory_batches')
          .select('id')
          .in('warehouse_id', batchWarehouseIds);

        if (batchError) {
          console.error('Error fetching batches:', batchError);
          return createErrorResponse(
            'Internal Server Error',
            `Failed to fetch batches: ${batchError.message}`,
            500,
            'BATCH_FETCH_ERROR'
          );
        }

        batchIds.push(...(batches?.map((b) => b.id) ?? []));
      }

      if (batchIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Use batched query for the final batch products query
      const {
        count: totalCount,
        data,
        error,
      } = await batchedInQuery(
        supabase,
        'inventory_batch_products',
        'batch_id',
        batchIds,
        { from, limit }
      );

      if (error) {
        console.error('Error querying inventory_batch_products:', error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount,
        data: data ?? [],
      });
    }

    // wallet_transactions needs join via workspace_wallets
    if (tableName === 'wallet_transactions') {
      const { data: wallets, error: walletError } = await supabase
        .from('workspace_wallets')
        .select('id')
        .eq('ws_id', wsId);

      if (walletError) {
        console.error('Error fetching workspace_wallets:', walletError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch wallets: ${walletError.message}`,
          500,
          'WALLET_FETCH_ERROR'
        );
      }

      const walletIds = wallets?.map((w) => w.id) ?? [];

      if (walletIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Use batched query to handle large wallet ID arrays
      const {
        count: totalCount,
        data,
        error,
      } = await batchedInQuery(
        supabase,
        'wallet_transactions',
        'wallet_id',
        walletIds,
        { from, limit }
      );

      if (error) {
        console.error('Error querying wallet_transactions:', error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount,
        data: data ?? [],
      });
    }

    // wallet_transaction_tags needs join via wallet_transactions -> workspace_wallets
    if (tableName === 'wallet_transaction_tags') {
      // First get wallet IDs for this workspace
      const { data: wallets, error: walletError } = await supabase
        .from('workspace_wallets')
        .select('id')
        .eq('ws_id', wsId);

      if (walletError) {
        console.error('Error fetching workspace_wallets:', walletError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch wallets: ${walletError.message}`,
          500,
          'WALLET_FETCH_ERROR'
        );
      }

      const walletIds = wallets?.map((w) => w.id) ?? [];

      if (walletIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Get all transaction IDs for those wallets (batch the wallet IDs query)
      const transactionIds: string[] = [];
      for (let i = 0; i < walletIds.length; i += MAX_IN_BATCH_SIZE) {
        const batchWalletIds = walletIds.slice(i, i + MAX_IN_BATCH_SIZE);
        const { data: transactions, error: txError } = await supabase
          .from('wallet_transactions')
          .select('id')
          .in('wallet_id', batchWalletIds);

        if (txError) {
          console.error('Error fetching wallet_transactions:', txError);
          return createErrorResponse(
            'Internal Server Error',
            `Failed to fetch transactions: ${txError.message}`,
            500,
            'TRANSACTION_FETCH_ERROR'
          );
        }

        transactionIds.push(...(transactions?.map((t) => t.id) ?? []));
      }

      if (transactionIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Use batched query for the final tags query (handles 13000+ transaction IDs)
      const {
        count: totalCount,
        data,
        error,
      } = await batchedInQuery(
        supabase,
        'wallet_transaction_tags',
        'transaction_id',
        transactionIds,
        { from, limit }
      );

      if (error) {
        console.error('Error querying wallet_transaction_tags:', error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount,
        data: data ?? [],
      });
    }

    // workspace_wallet_transfers needs join via wallet_transactions -> workspace_wallets
    if (tableName === 'workspace_wallet_transfers') {
      // First get wallet IDs for this workspace
      const { data: wallets, error: walletError } = await supabase
        .from('workspace_wallets')
        .select('id')
        .eq('ws_id', wsId);

      if (walletError) {
        console.error('Error fetching workspace_wallets:', walletError);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch wallets: ${walletError.message}`,
          500,
          'WALLET_FETCH_ERROR'
        );
      }

      const walletIds = wallets?.map((w) => w.id) ?? [];

      if (walletIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // Get all transaction IDs for those wallets (batch the wallet IDs query)
      const transactionIds: string[] = [];
      for (let i = 0; i < walletIds.length; i += MAX_IN_BATCH_SIZE) {
        const batchWalletIds = walletIds.slice(i, i + MAX_IN_BATCH_SIZE);
        const { data: transactions, error: txError } = await supabase
          .from('wallet_transactions')
          .select('id')
          .in('wallet_id', batchWalletIds);

        if (txError) {
          console.error('Error fetching wallet_transactions:', txError);
          return createErrorResponse(
            'Internal Server Error',
            `Failed to fetch transactions: ${txError.message}`,
            500,
            'TRANSACTION_FETCH_ERROR'
          );
        }

        transactionIds.push(...(transactions?.map((t) => t.id) ?? []));
      }

      if (transactionIds.length === 0) {
        return NextResponse.json({ count: 0, data: [] });
      }

      // For .or() queries with two columns, we need to batch differently
      // Query in batches and deduplicate results by composite key
      const seenKeys = new Set<string>();
      let totalCount = 0;
      const allData: unknown[] = [];

      // First pass: count total (batched)
      for (let i = 0; i < transactionIds.length; i += MAX_IN_BATCH_SIZE) {
        const batchIds = transactionIds.slice(i, i + MAX_IN_BATCH_SIZE);
        const orFilter = `from_transaction_id.in.(${batchIds.join(',')}),to_transaction_id.in.(${batchIds.join(',')})`;

        const { count, error: countError } = await supabase
          .from('workspace_wallet_transfers')
          .select('*', { count: 'exact', head: true })
          .or(orFilter);

        if (countError) {
          console.error(
            'Error counting workspace_wallet_transfers:',
            countError
          );
          return createErrorResponse(
            'Internal Server Error',
            `Failed to count records: ${countError.message}`,
            500,
            'COUNT_ERROR'
          );
        }

        totalCount += count ?? 0;
      }

      // Second pass: fetch data (batched), with deduplication
      let recordsToSkip = from;
      let recordsNeeded = limit;

      for (
        let i = 0;
        i < transactionIds.length && recordsNeeded > 0;
        i += MAX_IN_BATCH_SIZE
      ) {
        const batchIds = transactionIds.slice(i, i + MAX_IN_BATCH_SIZE);
        const orFilter = `from_transaction_id.in.(${batchIds.join(',')}),to_transaction_id.in.(${batchIds.join(',')})`;

        // Fetch more than needed to account for possible duplicates
        const { data, error } = await supabase
          .from('workspace_wallet_transfers')
          .select('*')
          .or(orFilter)
          .range(0, recordsToSkip + recordsNeeded + 100);

        if (error) {
          console.error('Error fetching workspace_wallet_transfers:', error);
          return createErrorResponse(
            'Internal Server Error',
            `Failed to fetch records: ${error.message}`,
            500,
            'FETCH_ERROR'
          );
        }

        for (const row of data ?? []) {
          const key = `${row.from_transaction_id}:${row.to_transaction_id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            if (recordsToSkip > 0) {
              recordsToSkip--;
            } else if (recordsNeeded > 0) {
              allData.push(row);
              recordsNeeded--;
            }
          }
        }
      }

      return NextResponse.json({
        count: totalCount,
        data: allData,
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

      // Use batched query to handle large ID arrays
      const { count: totalCount, data, error } = await batchedInQuery(
        supabase,
        tableName,
        joinConfig.joinColumn,
        parentIds,
        { from, limit }
      );

      if (error) {
        console.error(`Error querying ${tableName}:`, error);
        return createErrorResponse(
          'Internal Server Error',
          `Failed to fetch records: ${error.message}`,
          500,
          'FETCH_ERROR'
        );
      }

      return NextResponse.json({
        count: totalCount,
        data: data ?? [],
      });
    }

    // Tables with ws_id can be queried directly
    if (!TABLES_WITH_WS_ID.has(tableName)) {
      // This table doesn't have ws_id and wasn't handled by join config
      console.error(`Table ${tableName} has no ws_id and no join config`);
      return createErrorResponse(
        'Internal Server Error',
        `Table ${tableName} cannot be queried - no workspace scoping configured`,
        500,
        'CONFIG_ERROR'
      );
    }

    // First get total count
    const { count: totalCount, error: countError } = await supabase
      .from(tableName as 'workspace_users')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId);

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
      .eq('ws_id', wsId)
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

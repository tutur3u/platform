/**
 * Export utilities for finance transactions
 *
 * Contains type definitions and data fetching logic for exporting
 * transaction data to CSV/Excel formats.
 */

import { createClient } from '@tuturuuu/supabase/next/client';

// Export types for transaction data relationships

export type ExportTransactionCreator = {
  display_name: string | null;
  full_name: string | null;
  email: string | null;
};

export type ExportWorkspaceWallet = {
  name: string | null;
  ws_id: string | null;
};

export type ExportTransactionCategory = {
  name: string | null;
  is_expense: boolean | null;
};

export type ExportWorkspaceUser = {
  display_name: string | null;
  full_name: string | null;
  email: string | null;
};

export type ExportFinanceInvoice = {
  customer_id: string | null;
  workspace_users: ExportWorkspaceUser | ExportWorkspaceUser[] | null;
};

export type ExportWalletTransactionRow = {
  amount: number | null;
  description: string | null;
  taken_at: string | null;
  created_at: string | null;
  report_opt_in: boolean | null;
  workspace_wallets: ExportWorkspaceWallet | ExportWorkspaceWallet[] | null;
  transaction_categories:
    | ExportTransactionCategory
    | ExportTransactionCategory[]
    | null;
  distinct_transaction_creators:
    | ExportTransactionCreator
    | ExportTransactionCreator[]
    | null;
  finance_invoices: ExportFinanceInvoice | ExportFinanceInvoice[] | null;
};

export type TransactionExportRow = {
  amount: number | null;
  description: string | null;
  category: string | null;
  transaction_type: 'expense' | 'income' | null;
  wallet: string | null;
  taken_at: string | null;
  created_at: string | null;
  report_opt_in: boolean | null;
  creator_name: string | null;
  creator_email: string | null;
  invoice_for_name: string | null;
  invoice_for_email: string | null;
};

/**
 * Fetches paginated transaction data for export
 *
 * @param wsId - Workspace ID
 * @param params - Query parameters for filtering and pagination
 * @returns Object containing transaction data array and total count
 */
export async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    userIds,
    categoryIds,
    walletIds,
    tagIds,
    start,
    end,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    userIds?: string | string[];
    categoryIds?: string | string[];
    walletIds?: string | string[];
    tagIds?: string | string[];
    start?: string;
    end?: string;
  }
) {
  const supabase = createClient();

  // If tag filter is provided, first get transaction IDs with those tags
  let transactionIdsWithTags: string[] | null = null;
  if (tagIds) {
    const tagIdArray = Array.isArray(tagIds) ? tagIds : [tagIds];
    if (tagIdArray.length > 0) {
      const { data: taggedTransactions } = await supabase
        .from('wallet_transaction_tags')
        .select('transaction_id')
        .in('tag_id', tagIdArray);

      if (taggedTransactions) {
        transactionIdsWithTags = [
          ...new Set(taggedTransactions.map((t) => t.transaction_id)),
        ];
      }

      // If no transactions have any of the selected tags, return empty result
      if (!transactionIdsWithTags || transactionIdsWithTags.length === 0) {
        return {
          data: [] as TransactionExportRow[],
          count: 0,
        };
      }
    }
  }

  let queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      [
        'amount',
        'description',
        'taken_at',
        'created_at',
        'report_opt_in',
        'workspace_wallets!inner(name, ws_id)',
        'transaction_categories(name, is_expense)',
        'distinct_transaction_creators(display_name, full_name, email)',
        'finance_invoices!wallet_transactions_invoice_id_fkey(customer_id, workspace_users!finance_invoices_customer_id_fkey(display_name, full_name, email))',
      ].join(','),
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) queryBuilder = queryBuilder.ilike('description', `%${q}%`);

  // Filter by user IDs if provided
  if (userIds) {
    const userIdArray = Array.isArray(userIds) ? userIds : [userIds];
    if (userIdArray.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', userIdArray);
    }
  }

  // Filter by category IDs if provided
  if (categoryIds) {
    const categoryIdArray = Array.isArray(categoryIds)
      ? categoryIds
      : [categoryIds];
    if (categoryIdArray.length > 0) {
      queryBuilder = queryBuilder.in('category_id', categoryIdArray);
    }
  }

  // Filter by wallet IDs if provided
  if (walletIds) {
    const walletIdArray = Array.isArray(walletIds) ? walletIds : [walletIds];
    if (walletIdArray.length > 0) {
      queryBuilder = queryBuilder.in('wallet_id', walletIdArray);
    }
  }

  // Filter by transaction IDs if tag filter was applied
  if (transactionIdsWithTags) {
    queryBuilder = queryBuilder.in('id', transactionIdsWithTags);
  }

  // Filter by date range if provided
  if (start && end) {
    queryBuilder = queryBuilder.gte('taken_at', start).lte('taken_at', end);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const startOffset = (parsedPage - 1) * parsedSize;
    const endOffset = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(startOffset, endOffset);
  }

  // The select string includes nested relationships and explicit foreign keys.
  // Supabase's type-level select parser can produce a `GenericStringError` when
  // it can't fully validate the query. We override the return type here to keep
  // the export logic type-safe at the usage boundary.
  const {
    data: rawData,
    error,
    count,
  } = await queryBuilder.returns<ExportWalletTransactionRow[]>();
  if (error) throw error;

  const data = (rawData ?? []).map((row) => {
    const creator = Array.isArray(row.distinct_transaction_creators)
      ? (row.distinct_transaction_creators[0] ?? null)
      : row.distinct_transaction_creators;

    const invoice = Array.isArray(row.finance_invoices)
      ? (row.finance_invoices[0] ?? null)
      : row.finance_invoices;

    const invoiceCustomer = invoice
      ? Array.isArray(invoice.workspace_users)
        ? (invoice.workspace_users[0] ?? null)
        : invoice.workspace_users
      : null;

    const category = Array.isArray(row.transaction_categories)
      ? (row.transaction_categories[0] ?? null)
      : row.transaction_categories;

    const wallet = Array.isArray(row.workspace_wallets)
      ? (row.workspace_wallets[0] ?? null)
      : row.workspace_wallets;

    const creatorName = creator?.display_name || creator?.full_name || null;
    const invoiceForName =
      invoiceCustomer?.display_name || invoiceCustomer?.full_name || null;
    const transactionType =
      category?.is_expense === true
        ? 'expense'
        : category?.is_expense === false
          ? 'income'
          : null;

    return {
      amount: row.amount ?? null,
      description: row.description ?? null,
      category: category?.name ?? null,
      transaction_type: transactionType,
      wallet: wallet?.name ?? null,
      taken_at: row.taken_at ?? null,
      created_at: row.created_at ?? null,
      report_opt_in: row.report_opt_in ?? null,
      creator_name: creatorName,
      creator_email: creator?.email ?? null,
      invoice_for_name: invoiceForName,
      invoice_for_email: invoiceCustomer?.email ?? null,
    };
  });

  // Supabase can return null for count, so we need to handle that safely
  const safeCount = count ?? 0;

  return {
    data,
    count: safeCount,
  } as {
    data: TransactionExportRow[];
    count: number;
  };
}

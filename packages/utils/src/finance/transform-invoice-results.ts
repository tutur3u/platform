import type { Invoice } from '@tuturuuu/types/primitives/Invoice';

/**
 * Type definitions for the raw data structures returned from Supabase queries
 */

export interface SearchInvoiceRpcResult {
  id: string;
  ws_id: string;
  customer_id: string;
  notice?: string | null;
  note?: string | null;
  price: number;
  total_diff?: number | null;
  created_at: string;
  creator_id: string;
  platform_creator_id?: string | null;
  transaction_id?: string | null;
  customer_full_name?: string | null;
  customer_avatar_url?: string | null;
  total_count: number;
}

export interface FullInvoiceData {
  id: string;
  ws_id: string;
  customer_id: string | null;
  notice?: string | null;
  note?: string | null;
  price: number;
  total_diff?: number | null;
  created_at: string | null;
  creator_id: string | null;
  platform_creator_id?: string | null;
  transaction_id?: string | null;
  customer?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  legacy_creator: LegacyCreator | null;
  platform_creator: PlatformCreator | null;
  wallet_transactions: WalletTransaction | null;
}

export interface LegacyCreator {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface PlatformCreator {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  user_private_details: {
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface WalletTransaction {
  wallet: {
    name: string | null;
  } | null;
}

/**
 * Normalizes creator data from either platform or legacy creator sources
 * Resolves display_name, full_name, email, and avatar_url with proper fallback chain
 *
 * @param platformCreator Platform creator object (preferred source)
 * @param legacyCreator Legacy creator object (fallback source)
 * @returns Normalized creator object for Invoice type
 */
function normalizeCreator(
  platformCreator: PlatformCreator | null,
  legacyCreator: LegacyCreator | null
): Invoice['creator'] {
  return {
    id: platformCreator?.id ?? legacyCreator?.id ?? '',
    display_name:
      platformCreator?.display_name ??
      legacyCreator?.display_name ??
      platformCreator?.user_private_details?.email ??
      null,
    full_name:
      platformCreator?.user_private_details?.full_name ??
      legacyCreator?.full_name ??
      null,
    email:
      platformCreator?.user_private_details?.email ??
      legacyCreator?.email ??
      null,
    avatar_url:
      platformCreator?.avatar_url ?? legacyCreator?.avatar_url ?? null,
  };
}

/**
 * Extracts wallet information from wallet transaction data
 *
 * @param walletTransactions Wallet transaction object containing wallet relation
 * @returns Normalized wallet object for Invoice type, or null if no wallet present
 */
function normalizeWallet(
  walletTransactions: WalletTransaction | null
): { name: string | null } | null {
  return walletTransactions?.wallet
    ? { name: walletTransactions.wallet.name }
    : null;
}

/**
 * Intermediate type for merged search results
 * Combines SearchInvoiceRpcResult with additional creator and wallet data
 */
interface MergedSearchInvoiceData
  extends Omit<
    SearchInvoiceRpcResult,
    'customer_full_name' | 'customer_avatar_url'
  > {
  customer: {
    full_name: string | null;
    avatar_url: string | null;
  };
  legacy_creator: LegacyCreator | null;
  platform_creator: PlatformCreator | null;
  wallet_transactions: WalletTransaction | null;
}

/**
 * Transforms and merges search results from RPC with full invoice data from follow-up query
 * Handles creator resolution (platform_creator vs legacy_creator) and wallet mapping
 *
 * @param searchResults Raw results from the search_finance_invoices RPC function
 * @param fullInvoices Full invoice data fetched from finance_invoices table with relations
 * @returns Normalized Invoice[] array ready for UI consumption
 */
export function transformInvoiceSearchResults(
  searchResults: SearchInvoiceRpcResult[],
  fullInvoices: FullInvoiceData[]
): Invoice[] {
  // Create an index map for O(1) lookup instead of O(n) find operations
  const fullInvoiceMap = new Map(fullInvoices?.map((fi) => [fi.id, fi]) ?? []);

  // First merge: combine search results with full invoice data
  const rawData = searchResults.map((searchRow) => {
    const fullInvoice = fullInvoiceMap.get(searchRow.id);
    return {
      ...searchRow,
      customer: {
        full_name: searchRow.customer_full_name,
        avatar_url: searchRow.customer_avatar_url,
      },
      legacy_creator: fullInvoice?.legacy_creator || null,
      platform_creator: fullInvoice?.platform_creator || null,
      wallet_transactions: fullInvoice?.wallet_transactions || null,
    };
  }) as MergedSearchInvoiceData[];

  // Second transform: normalize creator data and shape into Invoice type
  return rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }: MergedSearchInvoiceData) => {
      const creator = normalizeCreator(
        platform_creator as PlatformCreator | null,
        legacy_creator as LegacyCreator | null
      );
      const wallet = normalizeWallet(wallet_transactions);

      return {
        ...rest,
        customer,
        creator,
        wallet,
      } as Invoice;
    }
  );
}

/**
 * Transforms direct query results (non-search path) into Invoice format
 * Used when no search query is present and we fetch via standard query builder
 *
 * @param rawData Array of raw invoice data with creator and wallet relations
 * @returns Normalized Invoice[] array ready for UI consumption
 */
export function transformInvoiceData(rawData: FullInvoiceData[]): Invoice[] {
  return rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }: FullInvoiceData) => {
      const creator = normalizeCreator(
        platform_creator as PlatformCreator | null,
        legacy_creator as LegacyCreator | null
      );
      const wallet = normalizeWallet(wallet_transactions);

      return {
        ...rest,
        customer,
        creator,
        wallet,
      } as Invoice;
    }
  );
}

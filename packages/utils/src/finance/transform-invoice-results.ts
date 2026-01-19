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
  // First merge: combine search results with full invoice data
  const rawData = searchResults.map((searchRow) => {
    const fullInvoice = fullInvoices?.find((fi) => fi.id === searchRow.id);
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
  });

  // Second transform: normalize creator data and shape into Invoice type
  return rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }: any) => {
      const platformCreator = platform_creator as PlatformCreator | null;
      const legacyCreator = legacy_creator as LegacyCreator | null;

      // Resolve creator from either platform or legacy source
      const creator = {
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

      // Extract wallet name if present
      const wallet = wallet_transactions?.wallet
        ? { name: wallet_transactions.wallet.name }
        : null;

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
export function transformInvoiceData(rawData: any[]): Invoice[] {
  return rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }) => {
      const platformCreator = platform_creator as PlatformCreator | null;
      const legacyCreator = legacy_creator as LegacyCreator | null;

      // Resolve creator from either platform or legacy source
      const creator = {
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

      // Extract wallet name if present
      const wallet = wallet_transactions?.wallet
        ? { name: wallet_transactions.wallet.name }
        : null;

      return {
        ...rest,
        customer,
        creator,
        wallet,
      } as Invoice;
    }
  );
}

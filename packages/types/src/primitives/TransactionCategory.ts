import type { Entity } from './Entity';

export interface TransactionCategory extends Entity {
  is_expense?: boolean;
  ws_id?: string;
  icon?: string | null;
  color?: string | null;
}

/**
 * Extended TransactionCategory with computed aggregation fields
 * returned by the RPC function `get_transaction_categories_with_amount_by_workspace`
 */
export interface TransactionCategoryWithStats extends TransactionCategory {
  /** Total absolute amount of all transactions in this category */
  amount?: number;
  /** Count of transactions in this category */
  transaction_count?: number;
}

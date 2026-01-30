import type { Transaction } from './Transaction';

/**
 * View mode for transaction grouping/aggregation
 */
export type TransactionViewMode = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * A period containing aggregated transaction data
 * Used for week/month/year views in the transactions list
 */
export interface TransactionPeriod {
  /** Start date of the period (ISO string) */
  periodStart: string;
  /** End date of the period (ISO string) */
  periodEnd: string;
  /** Human-readable period label (e.g., "January 2026", "Week 5, 2026") */
  periodLabel: string;
  /** Total income in this period */
  totalIncome: number;
  /** Total expense in this period (negative number) */
  totalExpense: number;
  /** Net total (income + expense) */
  netTotal: number;
  /** Number of transactions in this period */
  transactionCount: number;
  /** Transactions within this period (may be paginated) */
  transactions?: Transaction[];
  /** Whether some amounts are redacted due to confidentiality */
  hasRedactedAmounts?: boolean;
}

/**
 * Response structure for period-based transaction queries
 */
export interface TransactionPeriodResponse {
  data: TransactionPeriod[];
  nextCursor: string | null;
  hasMore: boolean;
}
